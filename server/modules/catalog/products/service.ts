/**
 * Produits : création, lecture détaillée, modification, corbeille, duplication, actions groupées.
 *
 * Règles :
 * - les prix sont stockés HT en FCFA entiers ; le TTC est calculé (module prix) ;
 * - publier (statut « approved » ou « published ») exige la permission catalog.products.publish ;
 * - un changement de slug crée une redirection 301 de l'ancienne URL (chaînes compactées) ;
 * - le stock ne se modifie pas ici : il passe par le grand livre (API stock) ; seul un stock
 *   initial peut être saisi à la création, tracé comme un mouvement ;
 * - verrou optimiste facultatif : envoyer `version` refuse la modification si le produit a changé ;
 * - chaque écriture est journalisée et émet product.created / product.updated / product.deleted.
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { packAvailableStock } from "@/lib/catalog-rules";
import { adjustStock, stockByWarehouse } from "@/lib/stock-ledger";
import {
  brands, categories, packItems, productAttachments, productCategories, productCombinationAttributes, productCustomizations, productDownloads,
  productFeatureValues, productImages, productPriceTiers, productSuppliers, productTags, productVariantImages, productVariants, products,
  relatedProducts, slugRedirects, specificPrices, suppliers, taxRuleGroups, users, attributeValues, attributeGroups, features, featureValues,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { recordAudit, changedFields } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { hasPermission } from "@/server/core/auth/principal";
import { getSetting } from "@/server/core/settings";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { DEFAULT_SHOP_ID } from "@/lib/db/schema";
import { fromLedgerError, uniqueSlug, type Context } from "@/server/modules/catalog/shared";
import { PUBLIC_STATUSES, productStatuses } from "@/server/modules/catalog/products/validators";

type ProductRow = typeof products.$inferSelect;

export const productListSpec: ListSpec = {
  sortable: { createdAt: products.createdAt, updatedAt: products.updatedAt, title: products.title, priceXof: products.priceXof, quantity: products.quantity, position: products.position, reference: products.reference },
  filterable: {
    status: { column: products.status, type: "enum", values: productStatuses },
    productType: { column: products.productType, type: "enum", values: ["standard", "pack", "virtual"] },
    visibility: { column: products.visibility, type: "enum", values: ["everywhere", "catalog", "search", "nowhere"] },
    categoryId: { column: products.categoryId, type: "number" },
    brandId: { column: products.brandId, type: "number" },
    supplierId: { column: products.supplierId, type: "uuid" },
    sellerId: { column: products.sellerId, type: "uuid" },
    isFeatured: { column: products.isFeatured, type: "boolean" },
    availableForOrder: { column: products.availableForOrder, type: "boolean" },
    quantity: { column: products.quantity, type: "number" },
    priceXof: { column: products.priceXof, type: "number" },
    reference: { column: products.reference, type: "string" },
    createdAt: { column: products.createdAt, type: "date" },
    updatedAt: { column: products.updatedAt, type: "date" },
  },
  searchable: [products.title, products.reference, products.sku, products.ean13, products.slug],
  defaultSort: "-updatedAt",
  maxLimit: 200,
};

const SCALAR_KEYS = [
  "title", "slug", "reference", "sku", "shortDescription", "description", "internalNote", "sellerId", "categoryId", "brandId", "supplierId", "taxRuleGroupId",
  "productType", "condition", "visibility", "status", "availableForOrder", "showPrice", "isFeatured", "allowReviews", "priceXof", "purchasePriceXof", "ecotaxXof",
  "unitPriceXof", "unitLabel", "minimumQuantity", "lowStockThreshold", "leadTimeDays", "deliveryTimeDays", "outOfStockBehavior", "restockDate", "inStockMessage",
  "outOfStockMessage", "ean13", "upc", "isbn", "mpn", "weightGrams", "lengthMm", "widthMm", "heightMm", "additionalShippingXof", "seoTitle", "seoDescription",
  "canonicalPath", "openGraphImageUrl", "redirectType", "redirectTargetType", "redirectTarget",
] as const;

export function productView(row: ProductRow) {
  const view: Record<string, unknown> = { id: row.id };
  for (const key of SCALAR_KEYS) view[key] = row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key];
  return {
    ...view,
    id: row.id, quantity: row.quantity, position: row.position, version: row.version,
    publishedAt: row.publishedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/* ─────────────────────────────  Lecture  ───────────────────────────── */

export async function listProducts(database: Db, query: ListQuery, options: { trash?: boolean } = {}) {
  const where = buildWhere(query, productListSpec, [options.trash ? isNotNull(products.deletedAt) : isNull(products.deletedAt)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(products).where(where).orderBy(...buildOrderBy(query, productListSpec, products.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(products).where(where),
  ]);
  const ids = rows.map((row) => row.id);
  const covers = ids.length ? await database.select({ productId: productImages.productId, url: productImages.url, isPrimary: productImages.isPrimary, sortOrder: productImages.sortOrder }).from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder)) : [];
  const coverOf = (id: string) => (covers.find((image) => image.productId === id && image.isPrimary) ?? covers.find((image) => image.productId === id))?.url ?? null;
  return {
    data: rows.map((row) => ({
      id: row.id, title: row.title, slug: row.slug, reference: row.reference, sku: row.sku, status: row.status, productType: row.productType, visibility: row.visibility,
      priceXof: row.priceXof, quantity: row.quantity, categoryId: row.categoryId, brandId: row.brandId, isFeatured: row.isFeatured, coverUrl: coverOf(row.id),
      updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null,
    })),
    meta: listMeta(query, Number(total?.value ?? 0)),
  };
}

export async function findProduct(executor: Executor, id: string, options: { lock?: boolean; includeDeleted?: boolean } = {}) {
  const query = executor.select().from(products).where(and(eq(products.id, id), options.includeDeleted ? undefined : isNull(products.deletedAt))).limit(1);
  const [row] = options.lock ? await query.for("update") : await query;
  return row ?? null;
}

/** Disponible d'un pack : son composant le plus rare. */
export async function packAvailability(executor: Executor, productId: string): Promise<number | null> {
  const items = await executor.select({ productId: packItems.componentProductId, variantId: packItems.componentVariantId, quantity: packItems.quantity, productQuantity: products.quantity, variantStock: productVariants.stock })
    .from(packItems).innerJoin(products, eq(products.id, packItems.componentProductId)).leftJoin(productVariants, eq(productVariants.id, packItems.componentVariantId))
    .where(eq(packItems.packProductId, productId));
  if (!items.length) return null;
  return packAvailableStock(items.map((item) => ({ quantity: item.variantId ? (item.variantStock ?? 0) : item.productQuantity, requiredQuantity: item.quantity })));
}

export async function combinationsOf(executor: Executor, productId: string) {
  const variants = await executor.select().from(productVariants).where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt))).orderBy(asc(productVariants.position), asc(productVariants.id));
  if (!variants.length) return [];
  const ids = variants.map((variant) => variant.id);
  const [attributes, images] = await Promise.all([
    executor.select({ variantId: productCombinationAttributes.variantId, valueId: attributeValues.id, valueCode: attributeValues.code, valueName: attributeValues.name, colorHex: attributeValues.colorHex, groupId: attributeGroups.id, groupCode: attributeGroups.code, groupName: attributeGroups.name, groupPosition: attributeGroups.position })
      .from(productCombinationAttributes).innerJoin(attributeValues, eq(attributeValues.id, productCombinationAttributes.attributeValueId)).innerJoin(attributeGroups, eq(attributeGroups.id, attributeValues.groupId))
      .where(inArray(productCombinationAttributes.variantId, ids)),
    executor.select().from(productVariantImages).where(inArray(productVariantImages.variantId, ids)).orderBy(asc(productVariantImages.position)),
  ]);
  return variants.map((variant) => ({
    id: variant.id, name: variant.name, value: variant.value, sku: variant.sku, ean13: variant.ean13, upc: variant.upc, combinationKey: variant.combinationKey,
    priceDeltaXof: variant.priceDeltaXof, weightImpactGrams: variant.weightImpactGrams, minimumQuantity: variant.minimumQuantity, lowStockThreshold: variant.lowStockThreshold,
    quantity: variant.stock, isDefault: variant.isDefault, isActive: variant.isActive, position: variant.position,
    attributes: attributes.filter((attribute) => attribute.variantId === variant.id).sort((a, b) => a.groupPosition - b.groupPosition)
      .map((attribute) => ({ groupId: attribute.groupId, groupCode: attribute.groupCode, groupName: attribute.groupName, valueId: attribute.valueId, valueCode: attribute.valueCode, valueName: attribute.valueName, colorHex: attribute.colorHex })),
    imageIds: images.filter((image) => image.variantId === variant.id).map((image) => image.imageId),
  }));
}

export async function getProduct(database: Db, id: string, options: { includeDeleted?: boolean } = {}) {
  const row = await findProduct(database, id, { includeDeleted: options.includeDeleted });
  if (!row) throw errors.notFound("Produit", id);
  const [images, categoryLinks, tags, featureRows, related, attachments, supplierLinks, pack, download, customizations, tiers, specificCount, combinations, warehouses] = await Promise.all([
    database.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder), asc(productImages.id)),
    database.select({ categoryId: productCategories.categoryId, isDefault: productCategories.isDefault, name: categories.name, slug: categories.slug }).from(productCategories).innerJoin(categories, eq(categories.id, productCategories.categoryId)).where(eq(productCategories.productId, id)),
    database.select({ tag: productTags.tag }).from(productTags).where(eq(productTags.productId, id)).orderBy(asc(productTags.tag)),
    database.select({ featureId: productFeatureValues.featureId, featureValueId: productFeatureValues.featureValueId, customValue: productFeatureValues.customValue, name: features.name, value: featureValues.value })
      .from(productFeatureValues).innerJoin(features, eq(features.id, productFeatureValues.featureId)).leftJoin(featureValues, eq(featureValues.id, productFeatureValues.featureValueId)).where(eq(productFeatureValues.productId, id)).orderBy(asc(features.position)),
    database.select({ productId: relatedProducts.relatedProductId, relationType: relatedProducts.relationType, title: products.title, slug: products.slug }).from(relatedProducts).innerJoin(products, eq(products.id, relatedProducts.relatedProductId)).where(eq(relatedProducts.productId, id)).orderBy(asc(relatedProducts.sortOrder)),
    database.select().from(productAttachments).where(eq(productAttachments.productId, id)).orderBy(asc(productAttachments.createdAt)),
    database.select({ supplierId: productSuppliers.supplierId, companyName: suppliers.companyName, supplierReference: productSuppliers.supplierReference, purchasePriceXof: productSuppliers.purchasePriceXof, currency: productSuppliers.currency, isDefault: productSuppliers.isDefault }).from(productSuppliers).innerJoin(suppliers, eq(suppliers.id, productSuppliers.supplierId)).where(eq(productSuppliers.productId, id)),
    database.select({ productId: packItems.componentProductId, variantId: packItems.componentVariantId, quantity: packItems.quantity, title: products.title }).from(packItems).innerJoin(products, eq(products.id, packItems.componentProductId)).where(eq(packItems.packProductId, id)),
    database.select().from(productDownloads).where(eq(productDownloads.productId, id)).limit(1),
    database.select().from(productCustomizations).where(eq(productCustomizations.productId, id)).orderBy(asc(productCustomizations.position)),
    database.select().from(productPriceTiers).where(eq(productPriceTiers.productId, id)).orderBy(asc(productPriceTiers.minimumQuantity)),
    database.select({ value: count() }).from(specificPrices).where(eq(specificPrices.productId, id)),
    combinationsOf(database, id),
    stockByWarehouse(database, { productId: id }),
  ]);
  const cover = images.find((image) => image.isPrimary) ?? images[0];
  return {
    ...productView(row),
    images: images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, position: image.sortOrder, isCover: image.id === cover?.id })),
    categories: [{ categoryId: row.categoryId, isDefault: true }, ...categoryLinks.filter((link) => link.categoryId !== row.categoryId).map((link) => ({ categoryId: link.categoryId, isDefault: false }))],
    tags: tags.map((entry) => entry.tag),
    features: featureRows.map((entry) => ({ featureId: entry.featureId, name: entry.name, featureValueId: entry.featureValueId, value: entry.customValue ?? entry.value })),
    relatedProducts: related.filter((entry) => entry.relationType === "related").map(({ productId, title, slug }) => ({ productId, title, slug })),
    accessories: related.filter((entry) => entry.relationType === "accessory").map(({ productId, title, slug }) => ({ productId, title, slug })),
    attachments: attachments.map((attachment) => ({ id: attachment.id, fileName: attachment.fileName, url: attachment.url, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes })),
    suppliers: supplierLinks,
    pack: row.productType === "pack" ? { items: pack, available: await packAvailability(database, id) } : null,
    download: download[0] ? { fileName: download[0].fileName, contentType: download[0].contentType, sizeBytes: download[0].sizeBytes, maxDownloads: download[0].maxDownloads, expiresAfterDays: download[0].expiresAfterDays, isActive: download[0].isActive } : null,
    customizations: customizations.map((field) => ({ id: field.id, label: field.label, type: field.type, isRequired: field.isRequired, maxChars: field.maxChars, maxBytes: field.maxBytes })),
    priceTiers: tiers.map((tier) => ({ id: tier.id, variantId: tier.variantId, minimumQuantity: tier.minimumQuantity, maximumQuantity: tier.maximumQuantity, unitPriceXof: tier.unitPriceXof })),
    specificPriceCount: Number(specificCount[0]?.value ?? 0),
    combinations,
    stock: { available: row.quantity, warehouses },
  };
}

/* ─────────────────────────────  Écriture  ───────────────────────────── */

type ProductInput = Partial<Record<(typeof SCALAR_KEYS)[number], unknown>> & {
  categoryIds?: number[]; tags?: string[]; relatedProductIds?: string[]; accessoryIds?: string[]; initialQuantity?: number; version?: number;
};

async function assertReferences(executor: Executor, input: ProductInput) {
  const issues: Array<{ path: string; message: string }> = [];
  if (input.sellerId) {
    const [seller] = await executor.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, String(input.sellerId))).limit(1);
    if (!seller || seller.status !== "active" || seller.role === "buyer") issues.push({ path: "sellerId", message: "Vendeur introuvable ou inactif." });
  }
  const categoryIds = [...new Set([...(input.categoryId ? [Number(input.categoryId)] : []), ...(input.categoryIds ?? [])])];
  if (categoryIds.length) {
    const found = await executor.select({ id: categories.id }).from(categories).where(and(inArray(categories.id, categoryIds), isNull(categories.deletedAt)));
    const missing = categoryIds.filter((id) => !found.some((row) => row.id === id));
    if (missing.length) issues.push({ path: "categoryIds", message: `Catégorie(s) introuvable(s) : ${missing.join(", ")}.` });
  }
  if (input.brandId) {
    const [brand] = await executor.select({ id: brands.id }).from(brands).where(and(eq(brands.id, Number(input.brandId)), isNull(brands.deletedAt))).limit(1);
    if (!brand) issues.push({ path: "brandId", message: "Marque introuvable." });
  }
  if (input.supplierId) {
    const [supplier] = await executor.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.id, String(input.supplierId)), isNull(suppliers.deletedAt))).limit(1);
    if (!supplier) issues.push({ path: "supplierId", message: "Fournisseur introuvable." });
  }
  if (input.taxRuleGroupId) {
    const [group] = await executor.select({ id: taxRuleGroups.id }).from(taxRuleGroups).where(and(eq(taxRuleGroups.id, String(input.taxRuleGroupId)), isNull(taxRuleGroups.deletedAt))).limit(1);
    if (!group) issues.push({ path: "taxRuleGroupId", message: "Règle de taxe introuvable." });
  }
  if (issues.length) throw errors.validation(issues);
}

function assertPublishRight(context: Context, status: unknown) {
  if (typeof status === "string" && (PUBLIC_STATUSES as readonly string[]).includes(status) && !hasPermission(context.actor, "catalog.products.publish")) {
    throw errors.forbidden("catalog.products.publish");
  }
}

function assertRedirect(input: ProductInput) {
  if (input.redirectType && !input.redirectTargetType) throw errors.validation([{ path: "redirectTargetType", message: "Précisez le type de cible de la redirection." }]);
  if (input.redirectTargetType === "url" && typeof input.redirectTarget === "string" && !/^(https:\/\/|\/)/.test(input.redirectTarget)) {
    throw errors.validation([{ path: "redirectTarget", message: "URL HTTPS ou chemin relatif attendu." }]);
  }
}

async function setCategories(executor: Executor, productId: string, defaultCategoryId: number, categoryIds: number[]) {
  const all = [...new Set([defaultCategoryId, ...categoryIds])];
  await executor.delete(productCategories).where(eq(productCategories.productId, productId));
  await executor.insert(productCategories).values(all.map((categoryId) => ({ productId, categoryId, isDefault: categoryId === defaultCategoryId })));
}

async function setTags(executor: Executor, productId: string, tags: string[]) {
  await executor.delete(productTags).where(eq(productTags.productId, productId));
  const unique = [...new Set(tags)];
  if (unique.length) await executor.insert(productTags).values(unique.map((tag) => ({ productId, tag })));
}

async function setRelations(executor: Executor, productId: string, relationType: "related" | "accessory", ids: string[]) {
  const unique = [...new Set(ids)].filter((id) => id !== productId);
  if (unique.length) {
    const found = await executor.select({ id: products.id }).from(products).where(and(inArray(products.id, unique), isNull(products.deletedAt)));
    const missing = unique.filter((id) => !found.some((row) => row.id === id));
    if (missing.length) throw errors.validation([{ path: relationType === "related" ? "relatedProductIds" : "accessoryIds", message: `Produit(s) introuvable(s) : ${missing.join(", ")}.` }]);
  }
  await executor.delete(relatedProducts).where(and(eq(relatedProducts.productId, productId), eq(relatedProducts.relationType, relationType)));
  if (unique.length) await executor.insert(relatedProducts).values(unique.map((relatedProductId, sortOrder) => ({ productId, relatedProductId, relationType, sortOrder })));
}

/** Redirection 301 de l'ancienne URL ; les redirections qui visaient l'ancienne URL sont raccourcies. */
async function recordSlugRedirect(executor: Executor, productId: string, oldSlug: string, newSlug: string) {
  const oldPath = `/produits/${oldSlug}`;
  const newPath = `/produits/${newSlug}`;
  await executor.delete(slugRedirects).where(eq(slugRedirects.oldPath, newPath));
  await executor.update(slugRedirects).set({ newPath }).where(eq(slugRedirects.newPath, oldPath));
  await executor.insert(slugRedirects).values({ oldPath, newPath, productId }).onConflictDoUpdate({ target: slugRedirects.oldPath, set: { newPath, productId } });
}

function columnsFrom(input: ProductInput) {
  const values: Record<string, unknown> = {};
  for (const key of SCALAR_KEYS) if (input[key] !== undefined) values[key] = input[key];
  return values;
}

export async function createProduct(database: Db, input: ProductInput & { title: string; sellerId: string; categoryId: number; priceXof: number }, context: Context) {
  assertPublishRight(context, input.status);
  assertRedirect(input);
  const id = await database.transaction(async (tx) => {
    await assertReferences(tx, input);
    const defaultStatus = await getSetting(tx as unknown as Db, context.actor.shopId ?? DEFAULT_SHOP_ID, "catalog.default_status");
    const defaultThreshold = await getSetting(tx as unknown as Db, context.actor.shopId ?? DEFAULT_SHOP_ID, "catalog.low_stock_threshold");
    const slug = await uniqueSlug(tx, products, { slug: products.slug, id: products.id }, (input.slug as string | undefined) ?? input.title, { explicit: Boolean(input.slug), maxLength: 200 });
    const status = ((input.status as string | undefined) ?? defaultStatus) as ProductRow["status"];
    const [created] = await tx.insert(products).values({
      ...(columnsFrom(input) as Partial<typeof products.$inferInsert>),
      title: input.title, sellerId: input.sellerId, categoryId: input.categoryId, priceXof: input.priceXof, description: (input.description as string | undefined) ?? "",
      slug, status, lowStockThreshold: (input.lowStockThreshold as number | undefined) ?? defaultThreshold, quantity: 0,
      publishedAt: (PUBLIC_STATUSES as readonly string[]).includes(status) ? new Date() : null,
    }).returning();
    await setCategories(tx, created.id, created.categoryId, input.categoryIds ?? []);
    if (input.tags) await setTags(tx, created.id, input.tags);
    if (input.relatedProductIds) await setRelations(tx, created.id, "related", input.relatedProductIds);
    if (input.accessoryIds) await setRelations(tx, created.id, "accessory", input.accessoryIds);
    if (input.initialQuantity && input.initialQuantity > 0) {
      await adjustStock(tx, { productId: created.id, delta: input.initialQuantity, reason: "inventory", employeeId: context.actor.employeeId, note: "Stock initial à la création du produit." }).catch(fromLedgerError);
    }
    await recordAudit(tx, { action: "product.created", entityType: "product", entityId: created.id, after: productView(created), details: { initialQuantity: input.initialQuantity ?? 0 }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.created", { productId: created.id }, { aggregateId: created.id, shopId: context.actor.shopId });
    return created.id;
  });
  return getProduct(database, id);
}

export async function updateProduct(database: Db, id: string, input: ProductInput, context: Context) {
  assertPublishRight(context, input.status);
  assertRedirect(input);
  await database.transaction(async (tx) => {
    const before = await findProduct(tx, id, { lock: true });
    if (!before) throw errors.notFound("Produit", id);
    if (input.version !== undefined && input.version !== before.version) {
      throw errors.conflict("Le produit a été modifié entre-temps : rechargez-le avant d'enregistrer.", { currentVersion: before.version });
    }
    if (input.productType && input.productType !== before.productType && before.productType === "pack") {
      await tx.delete(packItems).where(eq(packItems.packProductId, id));
    }
    await assertReferences(tx, input);
    const values = columnsFrom(input);
    if (typeof input.slug === "string" && input.slug !== before.slug) {
      values.slug = await uniqueSlug(tx, products, { slug: products.slug, id: products.id }, input.slug, { excludeId: id, explicit: true, maxLength: 200 });
      await recordSlugRedirect(tx, id, before.slug, String(values.slug));
    }
    if (typeof input.status === "string" && (PUBLIC_STATUSES as readonly string[]).includes(input.status) && !before.publishedAt) values.publishedAt = new Date();
    const [after] = await tx.update(products).set({ ...(values as Partial<typeof products.$inferInsert>), version: sql`${products.version} + 1`, updatedAt: new Date() }).where(eq(products.id, id)).returning();
    // Catégories associées : liste fournie, ou associations existantes + nouvelle catégorie par défaut.
    if (input.categoryIds !== undefined || (input.categoryId !== undefined && input.categoryId !== before.categoryId)) {
      const current = input.categoryIds ?? (await tx.select({ id: productCategories.categoryId }).from(productCategories).where(eq(productCategories.productId, id))).map((row) => row.id);
      await setCategories(tx, id, after.categoryId, current);
    }
    if (input.tags) await setTags(tx, id, input.tags);
    if (input.relatedProductIds) await setRelations(tx, id, "related", input.relatedProductIds);
    if (input.accessoryIds) await setRelations(tx, id, "accessory", input.accessoryIds);
    const beforeView = productView(before);
    const afterView = productView(after);
    const changed = [...changedFields({ ...beforeView, version: undefined, updatedAt: undefined }, { ...afterView, version: undefined, updatedAt: undefined }), ...(["categoryIds", "tags", "relatedProductIds", "accessoryIds"] as const).filter((key) => input[key] !== undefined)];
    await recordAudit(tx, { action: "product.updated", entityType: "product", entityId: id, before: beforeView, after: afterView, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.updated", { productId: id, changedFields: changed }, { aggregateId: id, shopId: context.actor.shopId });
  });
  return getProduct(database, id);
}

export async function deleteProduct(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findProduct(tx, id, { lock: true });
    if (!before) throw errors.notFound("Produit", id);
    await tx.update(products).set({ deletedAt: new Date(), updatedAt: new Date(), version: sql`${products.version} + 1` }).where(eq(products.id, id));
    await recordAudit(tx, { action: "product.deleted", entityType: "product", entityId: id, before: productView(before), actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.deleted", { productId: id }, { aggregateId: id, shopId: context.actor.shopId });
  });
}

export async function restoreProduct(database: Db, id: string, context: Context) {
  await database.transaction(async (tx) => {
    const before = await findProduct(tx, id, { lock: true, includeDeleted: true });
    if (!before || !before.deletedAt) throw errors.notFound("Produit dans la corbeille", id);
    // Un produit restauré revient en brouillon s'il était public : il doit être revu avant publication.
    const status = (PUBLIC_STATUSES as readonly string[]).includes(before.status) ? "draft" : before.status;
    await tx.update(products).set({ deletedAt: null, status, updatedAt: new Date(), version: sql`${products.version} + 1` }).where(eq(products.id, id));
    await recordAudit(tx, { action: "product.restored", entityType: "product", entityId: id, before: { deletedAt: before.deletedAt, status: before.status }, after: { deletedAt: null, status }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.updated", { productId: id, changedFields: ["deletedAt", "status"] }, { aggregateId: id, shopId: context.actor.shopId });
  });
  return getProduct(database, id);
}

/** Duplique un produit en brouillon, sans stock ni identifiants uniques (référence, SKU, codes-barres). */
export async function duplicateProduct(database: Db, id: string, input: { title?: string; copyCombinations?: boolean; copyImages?: boolean }, context: Context) {
  const newId = await database.transaction(async (tx) => {
    const source = await findProduct(tx, id);
    if (!source) throw errors.notFound("Produit", id);
    const title = input.title ?? `${source.title} (copie)`.slice(0, 190);
    const slug = await uniqueSlug(tx, products, { slug: products.slug, id: products.id }, title, { maxLength: 200 });
    const { id: _id, createdAt: _c, updatedAt: _u, deletedAt: _d, publishedAt: _p, version: _v, ...rest } = source;
    void _id; void _c; void _u; void _d; void _p; void _v;
    const [copy] = await tx.insert(products).values({ ...rest, title, slug, status: "draft" as const, quantity: 0, reference: null, sku: null, ean13: null, upc: null, isbn: null }).returning();
    const [links, tags, featuresRows, related, tiers, customizations] = await Promise.all([
      tx.select().from(productCategories).where(eq(productCategories.productId, id)),
      tx.select().from(productTags).where(eq(productTags.productId, id)),
      tx.select().from(productFeatureValues).where(eq(productFeatureValues.productId, id)),
      tx.select().from(relatedProducts).where(eq(relatedProducts.productId, id)),
      tx.select().from(productPriceTiers).where(and(eq(productPriceTiers.productId, id), isNull(productPriceTiers.variantId))),
      tx.select().from(productCustomizations).where(eq(productCustomizations.productId, id)),
    ]);
    if (links.length) await tx.insert(productCategories).values(links.map((link) => ({ productId: copy.id, categoryId: link.categoryId, isDefault: link.isDefault })));
    if (tags.length) await tx.insert(productTags).values(tags.map((tag) => ({ productId: copy.id, tag: tag.tag })));
    if (featuresRows.length) await tx.insert(productFeatureValues).values(featuresRows.map((row) => ({ productId: copy.id, featureId: row.featureId, featureValueId: row.featureValueId, customValue: row.customValue })));
    if (related.length) await tx.insert(relatedProducts).values(related.map((row) => ({ productId: copy.id, relatedProductId: row.relatedProductId, relationType: row.relationType, sortOrder: row.sortOrder })));
    if (tiers.length) await tx.insert(productPriceTiers).values(tiers.map((tier) => ({ productId: copy.id, minimumQuantity: tier.minimumQuantity, maximumQuantity: tier.maximumQuantity, unitPriceXof: tier.unitPriceXof, sortOrder: tier.sortOrder })));
    if (customizations.length) await tx.insert(productCustomizations).values(customizations.map((field) => ({ productId: copy.id, label: field.label, type: field.type, isRequired: field.isRequired, maxChars: field.maxChars, maxBytes: field.maxBytes, position: field.position })));
    const imageMap = new Map<number, number>();
    if (input.copyImages !== false) {
      const images = await tx.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder));
      for (const image of images) {
        const [created] = await tx.insert(productImages).values({ productId: copy.id, url: image.url, alt: image.alt, sortOrder: image.sortOrder, isPrimary: image.isPrimary }).returning({ id: productImages.id });
        imageMap.set(image.id, created.id);
      }
    }
    if (input.copyCombinations !== false) {
      const variants = await tx.select().from(productVariants).where(and(eq(productVariants.productId, id), isNull(productVariants.deletedAt)));
      for (const variant of variants) {
        const { id: variantId, productId: _pid, stock: _s, sku: _sku, ean13: _e, upc: _up, ...variantRest } = variant;
        void _pid; void _s; void _sku; void _e; void _up;
        const [createdVariant] = await tx.insert(productVariants).values({ ...variantRest, productId: copy.id, stock: 0, sku: null, ean13: null, upc: null }).returning({ id: productVariants.id });
        const attributes = await tx.select().from(productCombinationAttributes).where(eq(productCombinationAttributes.variantId, variantId));
        if (attributes.length) await tx.insert(productCombinationAttributes).values(attributes.map((attribute) => ({ variantId: createdVariant.id, attributeValueId: attribute.attributeValueId })));
        const variantImages = await tx.select().from(productVariantImages).where(eq(productVariantImages.variantId, variantId));
        const mapped = variantImages.filter((image) => imageMap.has(image.imageId));
        if (mapped.length) await tx.insert(productVariantImages).values(mapped.map((image) => ({ variantId: createdVariant.id, imageId: imageMap.get(image.imageId)!, position: image.position })));
      }
    }
    await recordAudit(tx, { action: "product.duplicated", entityType: "product", entityId: copy.id, details: { sourceProductId: id }, after: productView(copy), actor: context.actor, meta: context.meta });
    await emitEvent(tx, "product.created", { productId: copy.id }, { aggregateId: copy.id, shopId: context.actor.shopId });
    return copy.id;
  });
  return getProduct(database, newId);
}

/** Actions groupées : publication, dépublication, archivage, corbeille, mise en avant, catégorie. */
export async function bulkProducts(database: Db, input: { ids: string[]; action: "publish" | "unpublish" | "archive" | "delete" | "feature" | "unfeature" | "set_category"; categoryId?: number }, context: Context) {
  if (input.action === "publish") assertPublishRight(context, "approved");
  if (input.action === "set_category") await assertReferences(database, { categoryId: input.categoryId });
  const ids = [...new Set(input.ids)];
  return database.transaction(async (tx) => {
    const found = await tx.select({ id: products.id, status: products.status, categoryId: products.categoryId, isFeatured: products.isFeatured }).from(products).where(and(inArray(products.id, ids), isNull(products.deletedAt))).for("update");
    const now = new Date();
    const updates: Partial<typeof products.$inferInsert> =
      input.action === "publish" ? { status: "approved" } :
      input.action === "unpublish" ? { status: "draft" } :
      input.action === "archive" ? { status: "archived" } :
      input.action === "delete" ? { deletedAt: now } :
      input.action === "feature" ? { isFeatured: true } :
      input.action === "unfeature" ? { isFeatured: false } : { categoryId: input.categoryId };
    if (found.length) {
      const foundIds = found.map((row) => row.id);
      await tx.update(products).set({ ...updates, updatedAt: now, version: sql`${products.version} + 1` }).where(inArray(products.id, foundIds));
      // Date de première publication conservée pour les produits déjà publiés.
      if (input.action === "publish") await tx.update(products).set({ publishedAt: now }).where(and(inArray(products.id, foundIds), isNull(products.publishedAt)));
      if (input.action === "set_category") {
        for (const row of found) {
          await tx.delete(productCategories).where(and(eq(productCategories.productId, row.id), eq(productCategories.isDefault, true)));
          await tx.insert(productCategories).values({ productId: row.id, categoryId: input.categoryId!, isDefault: true }).onConflictDoUpdate({ target: [productCategories.productId, productCategories.categoryId], set: { isDefault: true } });
        }
      }
      for (const row of found) {
        const name = input.action === "delete" ? "product.deleted" : "product.updated";
        if (name === "product.deleted") await emitEvent(tx, "product.deleted", { productId: row.id }, { aggregateId: row.id, shopId: context.actor.shopId });
        else await emitEvent(tx, "product.updated", { productId: row.id, changedFields: Object.keys(updates) }, { aggregateId: row.id, shopId: context.actor.shopId });
      }
    }
    await recordAudit(tx, { action: `product.bulk_${input.action}`, entityType: "product", details: { ids: found.map((row) => row.id), categoryId: input.categoryId ?? null, notFound: ids.filter((id) => !found.some((row) => row.id === id)) }, actor: context.actor, meta: context.meta });
    return { updated: found.length, notFound: ids.filter((id) => !found.some((row) => row.id === id)) };
  });
}

/** Erreur de contrainte unique sur produit → message clair. */
export function productConflict(error: unknown): never {
  const cause = (error as { cause?: { code?: string; constraint_name?: string; constraint?: string } })?.cause ?? (error as { code?: string; constraint?: string });
  const constraint = (cause as { constraint_name?: string; constraint?: string })?.constraint_name ?? (cause as { constraint?: string })?.constraint;
  if ((cause as { code?: string })?.code === "23505") {
    const field = constraint?.includes("sku") ? "sku" : constraint?.includes("reference") ? "reference" : constraint?.includes("slug") ? "slug" : null;
    if (field) throw new AppError("CONFLICT", `Ce ${field === "sku" ? "SKU" : field === "reference" ? "numéro de référence" : "slug"} est déjà utilisé par un autre produit.`, { field });
  }
  throw error;
}
