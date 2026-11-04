/**
 * Sous-ressources d'un produit : images (ordre et couverture), déclinaisons générées depuis les
 * attributs, caractéristiques, pièces jointes, composition de pack, fournisseurs, fichier de
 * produit virtuel et champs de personnalisation.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";
import { generateCombinations } from "@/lib/catalog-rules";
import {
  attributeGroups, attributeValues, featureValues, features, packItems, productAttachments, productCombinationAttributes, productCustomizations,
  productDownloads, productFeatureValues, productImages, productSuppliers, productVariantImages, productVariants, products, suppliers,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { definedEntries, type Context } from "@/server/modules/catalog/shared";
import { combinationsOf, findProduct, packAvailability } from "@/server/modules/catalog/products/service";

async function requireProduct(executor: Executor, id: string) {
  const product = await findProduct(executor, id, { lock: true });
  if (!product) throw errors.notFound("Produit", id);
  return product;
}

async function touch(executor: Executor, productId: string, changed: string[], context: Context) {
  await executor.update(products).set({ updatedAt: new Date(), version: sql`${products.version} + 1` }).where(eq(products.id, productId));
  await emitEvent(executor, "product.updated", { productId, changedFields: changed }, { aggregateId: productId, shopId: context.actor.shopId });
}

/* ─────────────────────────────  Images  ───────────────────────────── */

async function imagesOf(executor: Executor, productId: string) {
  const rows = await executor.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id));
  const cover = rows.find((image) => image.isPrimary) ?? rows[0];
  return rows.map((image) => ({ id: image.id, url: image.url, alt: image.alt, position: image.sortOrder, isCover: image.id === cover?.id }));
}

export async function listImages(database: Db, productId: string) {
  if (!(await findProduct(database, productId))) throw errors.notFound("Produit", productId);
  return imagesOf(database, productId);
}

export async function addImage(database: Db, productId: string, input: { url: string; alt?: string | null; isCover?: boolean; position?: number }, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [{ value: last }] = await tx.select({ value: max(productImages.sortOrder) }).from(productImages).where(eq(productImages.productId, productId));
    const [{ value: hasCover }] = await tx.select({ value: sql<number>`count(*) filter (where ${productImages.isPrimary})::int` }).from(productImages).where(eq(productImages.productId, productId));
    const makeCover = input.isCover || Number(hasCover) === 0;
    if (makeCover) await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, productId));
    const [image] = await tx.insert(productImages).values({ productId, url: input.url, alt: input.alt ?? null, sortOrder: input.position ?? (last ?? -1) + 1, isPrimary: makeCover }).returning();
    await recordAudit(tx, { action: "product.image_added", entityType: "product", entityId: productId, after: { imageId: image.id, url: image.url, isCover: makeCover }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["images"], context);
    return (await imagesOf(tx, productId)).find((entry) => entry.id === image.id)!;
  });
}

export async function updateImage(database: Db, productId: string, imageId: number, input: { alt?: string | null; isCover?: true }, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [image] = await tx.select().from(productImages).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId))).limit(1);
    if (!image) throw errors.notFound("Image", imageId);
    if (input.isCover) await tx.update(productImages).set({ isPrimary: false }).where(and(eq(productImages.productId, productId), ne(productImages.id, imageId)));
    await tx.update(productImages).set(definedEntries({ alt: input.alt, isPrimary: input.isCover })).where(eq(productImages.id, imageId));
    await recordAudit(tx, { action: "product.image_updated", entityType: "product", entityId: productId, before: { imageId, alt: image.alt, isCover: image.isPrimary }, after: { imageId, ...input }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["images"], context);
    return (await imagesOf(tx, productId)).find((entry) => entry.id === imageId)!;
  });
}

export async function deleteImage(database: Db, productId: string, imageId: number, context: Context) {
  await database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [image] = await tx.delete(productImages).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId))).returning();
    if (!image) throw errors.notFound("Image", imageId);
    // La couverture supprimée est remplacée par la première image restante.
    if (image.isPrimary) {
      const [next] = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder), asc(productImages.id)).limit(1);
      if (next) await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, next.id));
    }
    await recordAudit(tx, { action: "product.image_deleted", entityType: "product", entityId: productId, before: { imageId, url: image.url }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["images"], context);
  });
}

export async function reorderImages(database: Db, productId: string, imageIds: number[], context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const current = await tx.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, productId));
    const known = new Set(current.map((row) => row.id));
    if (imageIds.length !== known.size || imageIds.some((id) => !known.has(id)) || new Set(imageIds).size !== imageIds.length) {
      throw errors.validation([{ path: "imageIds", message: "La liste doit contenir chaque image du produit une seule fois." }]);
    }
    for (const [position, id] of imageIds.entries()) await tx.update(productImages).set({ sortOrder: position }).where(eq(productImages.id, id));
    await recordAudit(tx, { action: "product.images_reordered", entityType: "product", entityId: productId, after: { imageIds }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["images"], context);
    return imagesOf(tx, productId);
  });
}

/* ─────────────────────────────  Déclinaisons  ───────────────────────────── */

const keyFor = (key: string) => (key.length <= 64 ? key : `h:${createHash("sha1").update(key).digest("hex")}`);

export async function listCombinations(database: Db, productId: string) {
  if (!(await findProduct(database, productId))) throw errors.notFound("Produit", productId);
  return combinationsOf(database, productId);
}

/**
 * Génère toutes les combinaisons des valeurs choisies (produit cartésien par groupe d'attributs).
 * Régénérer est sans risque : une combinaison existante (même clé) est conservée telle quelle.
 */
export async function generateProductCombinations(database: Db, productId: string, input: { attributeValueIds: string[]; priceImpactXof?: number }, context: Context) {
  return database.transaction(async (tx) => {
    const product = await requireProduct(tx, productId);
    if (product.productType !== "standard") throw errors.rule("Seul un produit standard peut avoir des déclinaisons (ni pack, ni virtuel).");
    const values = await tx.select({ id: attributeValues.id, code: attributeValues.code, name: attributeValues.name, groupId: attributeGroups.id, groupCode: attributeGroups.code, groupName: attributeGroups.name, groupPosition: attributeGroups.position })
      .from(attributeValues).innerJoin(attributeGroups, eq(attributeGroups.id, attributeValues.groupId)).where(inArray(attributeValues.id, [...new Set(input.attributeValueIds)]));
    if (values.length !== new Set(input.attributeValueIds).size) throw errors.validation([{ path: "attributeValueIds", message: "Une ou plusieurs valeurs d'attribut sont introuvables." }]);
    const groups = new Map<string, typeof values>();
    for (const value of values) groups.set(value.groupCode, [...(groups.get(value.groupCode) ?? []), value]);
    let combinations;
    try {
      combinations = generateCombinations([...groups.entries()].map(([code, list]) => ({ code, values: list.map((value) => ({ code: value.code, id: value.id })) })));
    } catch (error) {
      throw errors.rule(error instanceof Error ? error.message : "Trop de combinaisons.");
    }
    const existing = await tx.select({ key: productVariants.combinationKey }).from(productVariants).where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)));
    const existingKeys = new Set(existing.map((row) => row.key));
    const orderedGroups = [...groups.values()].sort((a, b) => a[0].groupPosition - b[0].groupPosition);
    const [{ value: lastPosition }] = await tx.select({ value: max(productVariants.position) }).from(productVariants).where(eq(productVariants.productId, productId));
    const [{ value: activeCount }] = await tx.select({ value: sql<number>`count(*)::int` }).from(productVariants).where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt)));
    let position = (lastPosition ?? -1) + 1;
    let created = 0;
    for (const combination of combinations) {
      const key = keyFor(combination.key);
      if (existingKeys.has(key)) continue;
      const chosen = orderedGroups.map((list) => list.find((value) => combination.selection[value.groupCode] === value.code)!);
      const name = chosen.map((value) => value.groupName).join(" / ").slice(0, 100);
      const label = chosen.map((value) => value.name).join(" / ").slice(0, 120);
      const [variant] = await tx.insert(productVariants).values({
        productId, name, value: label, combinationKey: key, priceDeltaXof: input.priceImpactXof ?? 0, stock: 0, position: position++,
        isDefault: Number(activeCount) === 0 && created === 0, attributes: Object.fromEntries(chosen.map((value) => [value.groupCode, value.code])),
      }).returning({ id: productVariants.id });
      await tx.insert(productCombinationAttributes).values(chosen.map((value) => ({ variantId: variant.id, attributeValueId: value.id })));
      created += 1;
    }
    await recordAudit(tx, { action: "product.combinations_generated", entityType: "product", entityId: productId, details: { created, skipped: combinations.length - created, attributeValueIds: input.attributeValueIds }, actor: context.actor, meta: context.meta });
    if (created) await touch(tx, productId, ["combinations"], context);
    return { created, skipped: combinations.length - created, combinations: await combinationsOf(tx, productId) };
  });
}

type CombinationInput = { sku?: string | null; ean13?: string | null; upc?: string | null; priceDeltaXof?: number; weightImpactGrams?: number; minimumQuantity?: number | null; lowStockThreshold?: number; isDefault?: true; isActive?: boolean; imageIds?: number[] };

export async function updateCombination(database: Db, productId: string, variantId: number, input: CombinationInput, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [before] = await tx.select().from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt))).limit(1).for("update");
    if (!before) throw errors.notFound("Déclinaison", variantId);
    if (input.isDefault) await tx.update(productVariants).set({ isDefault: false }).where(and(eq(productVariants.productId, productId), ne(productVariants.id, variantId)));
    const { imageIds, ...fields } = input;
    if (Object.keys(definedEntries(fields)).length) await tx.update(productVariants).set(definedEntries(fields)).where(eq(productVariants.id, variantId));
    if (imageIds) {
      const owned = imageIds.length ? await tx.select({ id: productImages.id }).from(productImages).where(and(eq(productImages.productId, productId), inArray(productImages.id, imageIds))) : [];
      if (owned.length !== new Set(imageIds).size) throw errors.validation([{ path: "imageIds", message: "Les images doivent appartenir au produit." }]);
      await tx.delete(productVariantImages).where(eq(productVariantImages.variantId, variantId));
      if (imageIds.length) await tx.insert(productVariantImages).values([...new Set(imageIds)].map((imageId, position) => ({ variantId, imageId, position })));
    }
    await recordAudit(tx, { action: "product.combination_updated", entityType: "product", entityId: productId, before: { variantId, sku: before.sku, priceDeltaXof: before.priceDeltaXof, isDefault: before.isDefault, isActive: before.isActive }, after: { variantId, ...input }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["combinations"], context);
    return (await combinationsOf(tx, productId)).find((entry) => entry.id === variantId)!;
  });
}

export async function deleteCombination(database: Db, productId: string, variantId: number, context: Context) {
  await database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [before] = await tx.select().from(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId), isNull(productVariants.deletedAt))).limit(1).for("update");
    if (!before) throw errors.notFound("Déclinaison", variantId);
    await tx.update(productVariants).set({ deletedAt: new Date(), isActive: false, isDefault: false }).where(eq(productVariants.id, variantId));
    // La déclinaison par défaut supprimée est remplacée par la première déclinaison active.
    if (before.isDefault) {
      const [next] = await tx.select({ id: productVariants.id }).from(productVariants).where(and(eq(productVariants.productId, productId), isNull(productVariants.deletedAt), eq(productVariants.isActive, true))).orderBy(asc(productVariants.position)).limit(1);
      if (next) await tx.update(productVariants).set({ isDefault: true }).where(eq(productVariants.id, next.id));
    }
    await recordAudit(tx, { action: "product.combination_deleted", entityType: "product", entityId: productId, before: { variantId, value: before.value, stock: before.stock }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["combinations"], context);
  });
}

/* ─────────────────────────────  Caractéristiques  ───────────────────────────── */

export async function setProductFeatures(database: Db, productId: string, entries: Array<{ featureId: string; featureValueId?: string | null; customValue?: string | null }>, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const featureIds = [...new Set(entries.map((entry) => entry.featureId))];
    if (featureIds.length !== entries.length) throw errors.validation([{ path: "features", message: "Une caractéristique ne peut apparaître qu'une fois." }]);
    if (featureIds.length) {
      const found = await tx.select({ id: features.id }).from(features).where(inArray(features.id, featureIds));
      if (found.length !== featureIds.length) throw errors.validation([{ path: "features", message: "Caractéristique introuvable." }]);
    }
    const valueIds = entries.map((entry) => entry.featureValueId).filter((id): id is string => Boolean(id));
    if (valueIds.length) {
      const found = await tx.select({ id: featureValues.id, featureId: featureValues.featureId }).from(featureValues).where(inArray(featureValues.id, valueIds));
      const mismatch = entries.some((entry) => entry.featureValueId && found.find((value) => value.id === entry.featureValueId)?.featureId !== entry.featureId);
      if (mismatch) throw errors.validation([{ path: "features", message: "Une valeur ne correspond pas à sa caractéristique." }]);
    }
    await tx.delete(productFeatureValues).where(eq(productFeatureValues.productId, productId));
    if (entries.length) await tx.insert(productFeatureValues).values(entries.map((entry) => ({ productId, featureId: entry.featureId, featureValueId: entry.featureValueId ?? null, customValue: entry.customValue ?? null })));
    await recordAudit(tx, { action: "product.features_updated", entityType: "product", entityId: productId, after: { features: entries }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["features"], context);
    return { count: entries.length };
  });
}

/* ─────────────────────────────  Pièces jointes  ───────────────────────────── */

export async function addAttachment(database: Db, productId: string, input: { fileName: string; url: string; contentType: string; sizeBytes: number }, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [attachment] = await tx.insert(productAttachments).values({ productId, ...input, uploadedByEmployeeId: context.actor.employeeId }).returning();
    await recordAudit(tx, { action: "product.attachment_added", entityType: "product", entityId: productId, after: { attachmentId: attachment.id, fileName: input.fileName }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["attachments"], context);
    return { id: attachment.id, fileName: attachment.fileName, url: attachment.url, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes };
  });
}

export async function deleteAttachment(database: Db, productId: string, attachmentId: string, context: Context) {
  await database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [deleted] = await tx.delete(productAttachments).where(and(eq(productAttachments.id, attachmentId), eq(productAttachments.productId, productId))).returning();
    if (!deleted) throw errors.notFound("Pièce jointe", attachmentId);
    await recordAudit(tx, { action: "product.attachment_deleted", entityType: "product", entityId: productId, before: { attachmentId, fileName: deleted.fileName }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["attachments"], context);
  });
}

/* ─────────────────────────────  Pack  ───────────────────────────── */

export async function setPackItems(database: Db, productId: string, items: Array<{ productId: string; variantId?: number | null; quantity: number }>, context: Context) {
  return database.transaction(async (tx) => {
    const pack = await requireProduct(tx, productId);
    if (pack.productType !== "pack") throw errors.rule("Ce produit n'est pas un pack : passez son type à « pack » avant de le composer.");
    const keys = items.map((item) => `${item.productId}:${item.variantId ?? ""}`);
    if (new Set(keys).size !== keys.length) throw errors.validation([{ path: "items", message: "Un composant ne peut apparaître qu'une fois." }]);
    if (items.some((item) => item.productId === productId)) throw errors.rule("Un pack ne peut pas se contenir lui-même.");
    if (items.length) {
      const components = await tx.select({ id: products.id, productType: products.productType }).from(products).where(and(inArray(products.id, [...new Set(items.map((item) => item.productId))]), isNull(products.deletedAt)));
      if (components.length !== new Set(items.map((item) => item.productId)).size) throw errors.validation([{ path: "items", message: "Composant introuvable." }]);
      if (components.some((component) => component.productType === "pack")) throw errors.rule("Un pack ne peut pas contenir un autre pack.");
      const variantIds = items.map((item) => item.variantId).filter((id): id is number => id != null);
      if (variantIds.length) {
        const variants = await tx.select({ id: productVariants.id, productId: productVariants.productId }).from(productVariants).where(and(inArray(productVariants.id, variantIds), isNull(productVariants.deletedAt)));
        if (items.some((item) => item.variantId != null && variants.find((variant) => variant.id === item.variantId)?.productId !== item.productId)) {
          throw errors.validation([{ path: "items", message: "Une déclinaison ne correspond pas à son produit." }]);
        }
      }
    }
    await tx.delete(packItems).where(eq(packItems.packProductId, productId));
    if (items.length) await tx.insert(packItems).values(items.map((item) => ({ packProductId: productId, componentProductId: item.productId, componentVariantId: item.variantId ?? null, quantity: item.quantity })));
    await recordAudit(tx, { action: "product.pack_updated", entityType: "product", entityId: productId, after: { items }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["pack"], context);
    return { items, available: await packAvailability(tx, productId) };
  });
}

/* ─────────────────────────────  Fournisseurs du produit  ───────────────────────────── */

export async function setProductSuppliers(database: Db, productId: string, entries: Array<{ supplierId: string; supplierReference?: string | null; purchasePriceXof?: number | null; currency?: string; isDefault?: boolean }>, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const ids = [...new Set(entries.map((entry) => entry.supplierId))];
    if (ids.length !== entries.length) throw errors.validation([{ path: "suppliers", message: "Un fournisseur ne peut apparaître qu'une fois." }]);
    if (ids.length) {
      const found = await tx.select({ id: suppliers.id }).from(suppliers).where(and(inArray(suppliers.id, ids), isNull(suppliers.deletedAt)));
      if (found.length !== ids.length) throw errors.validation([{ path: "suppliers", message: "Fournisseur introuvable." }]);
    }
    await tx.delete(productSuppliers).where(eq(productSuppliers.productId, productId));
    const defaultEntry = entries.find((entry) => entry.isDefault) ?? entries[0];
    if (entries.length) {
      await tx.insert(productSuppliers).values(entries.map((entry) => ({ productId, supplierId: entry.supplierId, supplierReference: entry.supplierReference ?? null, purchasePriceXof: entry.purchasePriceXof ?? null, currency: entry.currency ?? "XOF", isDefault: entry === defaultEntry })));
    }
    // Le fournisseur par défaut alimente la fiche produit et son prix d'achat s'il est en FCFA.
    await tx.update(products).set({
      supplierId: defaultEntry?.supplierId ?? null,
      ...(defaultEntry?.purchasePriceXof != null && (defaultEntry.currency ?? "XOF") === "XOF" ? { purchasePriceXof: defaultEntry.purchasePriceXof } : {}),
    }).where(eq(products.id, productId));
    await recordAudit(tx, { action: "product.suppliers_updated", entityType: "product", entityId: productId, after: { suppliers: entries }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["suppliers"], context);
    return { count: entries.length, defaultSupplierId: defaultEntry?.supplierId ?? null };
  });
}

/* ─────────────────────────────  Produit virtuel  ───────────────────────────── */

export async function setDownload(database: Db, productId: string, input: { fileName: string; storageKey: string; contentType?: string; sizeBytes?: number; maxDownloads?: number | null; expiresAfterDays?: number | null; isActive?: boolean }, context: Context) {
  return database.transaction(async (tx) => {
    const product = await requireProduct(tx, productId);
    if (product.productType !== "virtual") throw errors.rule("Seul un produit virtuel peut porter un fichier à télécharger.");
    const values = { fileName: input.fileName, storageKey: input.storageKey, contentType: input.contentType ?? "application/octet-stream", sizeBytes: input.sizeBytes ?? 0, maxDownloads: input.maxDownloads ?? null, expiresAfterDays: input.expiresAfterDays ?? null, isActive: input.isActive ?? true, updatedAt: new Date() };
    await tx.insert(productDownloads).values({ productId, ...values }).onConflictDoUpdate({ target: productDownloads.productId, set: values });
    await recordAudit(tx, { action: "product.download_updated", entityType: "product", entityId: productId, after: { fileName: input.fileName, storageKey: input.storageKey, maxDownloads: values.maxDownloads, expiresAfterDays: values.expiresAfterDays }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["download"], context);
    return { fileName: values.fileName, contentType: values.contentType, sizeBytes: values.sizeBytes, maxDownloads: values.maxDownloads, expiresAfterDays: values.expiresAfterDays, isActive: values.isActive };
  });
}

export async function deleteDownload(database: Db, productId: string, context: Context) {
  await database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    const [deleted] = await tx.delete(productDownloads).where(eq(productDownloads.productId, productId)).returning();
    if (!deleted) throw errors.notFound("Fichier du produit virtuel");
    await recordAudit(tx, { action: "product.download_deleted", entityType: "product", entityId: productId, before: { fileName: deleted.fileName }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["download"], context);
  });
}

/* ─────────────────────────────  Personnalisation  ───────────────────────────── */

export async function setCustomizations(database: Db, productId: string, fields: Array<{ label: string; type?: "text" | "file"; isRequired?: boolean; maxChars?: number | null; maxBytes?: number | null }>, context: Context) {
  return database.transaction(async (tx) => {
    await requireProduct(tx, productId);
    await tx.delete(productCustomizations).where(eq(productCustomizations.productId, productId));
    if (fields.length) {
      await tx.insert(productCustomizations).values(fields.map((field, position) => ({ productId, label: field.label, type: field.type ?? "text", isRequired: field.isRequired ?? false, maxChars: field.maxChars ?? null, maxBytes: field.maxBytes ?? null, position })));
    }
    await recordAudit(tx, { action: "product.customizations_updated", entityType: "product", entityId: productId, after: { fields }, actor: context.actor, meta: context.meta });
    await touch(tx, productId, ["customizations"], context);
    return { count: fields.length };
  });
}
