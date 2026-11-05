/**
 * Catalogue public de la boutique : catégories, marques, liste et fiche produit.
 *
 * Un produit est visible s'il n'est pas supprimé, a un statut public (approved ou published),
 * une visibilité autre que « nowhere », et si son vendeur est actif et vérifié (même règle que les
 * pages de la boutique). En recherche, seuls « everywhere » et « search » ; en navigation,
 * « everywhere » et « catalog ». Les prix sont ceux du client connecté (groupe, prix spécifiques).
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { canSell, isValidEan13 } from "@/lib/catalog-rules";
import {
  brands, categories, productAttachments, productFeatureValues, productImages, productTags, products, relatedProducts, sellerProfiles, slugRedirects, users,
  features, featureValues,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { getSetting } from "@/server/core/settings";
import { likePattern } from "@/server/core/http/list-query";
import { categoryTree, categoryWithDescendants, type CategoryNode } from "@/server/modules/catalog/taxonomy/service";
import { combinationsOf, packAvailability } from "@/server/modules/catalog/products/service";
import { PUBLIC_STATUSES } from "@/server/modules/catalog/products/validators";
import { priceProducts, publicPrice, type PricingContext } from "@/server/modules/pricing/service";

/** Conditions de visibilité publique d'un produit. */
export function publicProductCondition(mode: "catalog" | "search" | "any" = "any"): SQL {
  const visibility = mode === "catalog" ? inArray(products.visibility, ["everywhere", "catalog"]) : mode === "search" ? inArray(products.visibility, ["everywhere", "search"]) : ne(products.visibility, "nowhere");
  return and(
    isNull(products.deletedAt),
    inArray(products.status, [...PUBLIC_STATUSES]),
    visibility,
    sql`exists (select 1 from ${users} u join ${sellerProfiles} sp on sp.user_id = u.id where u.id = ${products.sellerId} and u.status = 'active' and sp.verification_status = 'approved')`,
  )!;
}

async function publicCounts(executor: Executor) {
  const rows = await executor.select({ categoryId: products.categoryId, value: count() }).from(products).where(publicProductCondition("catalog")).groupBy(products.categoryId);
  return new Map(rows.map((row) => [row.categoryId, Number(row.value)]));
}

type PublicNode = { id: number; name: string; slug: string; description: string | null; imageUrl: string | null; bannerUrl: string | null; path: string[]; depth: number; productCount: number; children: PublicNode[] };

function toPublicNode(node: CategoryNode): PublicNode {
  const children = node.children.map(toPublicNode);
  return { id: node.id, name: node.name, slug: node.slug, description: node.description, imageUrl: node.imageUrl, bannerUrl: node.bannerUrl, path: node.path, depth: node.depth, productCount: node.productCount + children.reduce((sum, child) => sum + child.productCount, 0), children };
}

export async function publicCategories(database: Db) {
  return (await categoryTree(database, { activeOnly: true, productCounts: await publicCounts(database) })).map(toPublicNode);
}

function findNode(nodes: PublicNode[], slug: string, trail: PublicNode[] = []): { node: PublicNode; trail: PublicNode[] } | null {
  for (const node of nodes) {
    if (node.slug === slug) return { node, trail };
    const found = findNode(node.children, slug, [...trail, node]);
    if (found) return found;
  }
  return null;
}

export async function publicCategory(database: Db, slug: string) {
  const tree = await publicCategories(database);
  const found = findNode(tree, slug);
  if (!found) throw errors.notFound("Catégorie", slug);
  const [row] = await database.select({ metaTitle: categories.metaTitle, metaDescription: categories.metaDescription }).from(categories).where(eq(categories.id, found.node.id)).limit(1);
  return {
    ...found.node, metaTitle: row?.metaTitle ?? null, metaDescription: row?.metaDescription ?? null,
    breadcrumb: [...found.trail, found.node].map((entry) => ({ id: entry.id, name: entry.name, slug: entry.slug })),
  };
}

export async function publicBrands(database: Db) {
  const rows = await database.select({ id: brands.id, name: brands.name, slug: brands.slug, logoUrl: brands.logoUrl, description: brands.description, productCount: sql<number>`count(${products.id})::int` })
    .from(brands).leftJoin(products, and(eq(products.brandId, brands.id), publicProductCondition("catalog")))
    .where(and(eq(brands.isActive, true), isNull(brands.deletedAt))).groupBy(brands.id).orderBy(asc(brands.name));
  return rows.map((row) => ({ ...row, productCount: Number(row.productCount) }));
}

/* ─────────────────────────────  Liste de produits  ───────────────────────────── */

export type ProductSearch = {
  page: number; limit?: number; q?: string; category?: string; brand?: string; minPrice?: number; maxPrice?: number; inStock?: boolean; featured?: boolean;
  sort: "relevance" | "newest" | "price_asc" | "price_desc" | "name";
  /** Sélection explicite (blocs de pages CMS). */
  ids?: string[];
};

async function covers(executor: Executor, ids: string[]) {
  if (!ids.length) return new Map<string, { url: string; alt: string | null }>();
  const rows = await executor.select({ productId: productImages.productId, url: productImages.url, alt: productImages.alt, isPrimary: productImages.isPrimary }).from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder), asc(productImages.id));
  const map = new Map<string, { url: string; alt: string | null }>();
  for (const row of rows) if (!map.has(row.productId) || row.isPrimary) map.set(row.productId, { url: row.url, alt: row.alt });
  return map;
}

function availability(product: { quantity: number; availableForOrder: boolean; outOfStockBehavior: "refuse" | "backorder" | "use_default"; lowStockThreshold: number; inStockMessage: string | null; outOfStockMessage: string | null; restockDate: Date | null; productType: string }, allowBackorders: boolean, packAvailable: number | null) {
  const available = product.productType === "pack" ? (packAvailable ?? 0) : product.productType === "virtual" ? Number.POSITIVE_INFINITY : product.quantity;
  const sellable = canSell({ available: Number.isFinite(available) ? available : 1, requested: 1, availableForOrder: product.availableForOrder, behavior: product.outOfStockBehavior, defaultBehavior: allowBackorders ? "backorder" : "refuse" }).sellable;
  const status = !product.availableForOrder ? "unavailable" : available <= 0 ? (sellable ? "backorder" : "out_of_stock") : available <= product.lowStockThreshold ? "low_stock" : "in_stock";
  return {
    status, canOrder: sellable,
    message: status === "out_of_stock" || status === "backorder" ? product.outOfStockMessage ?? null : product.inStockMessage ?? null,
    restockDate: available <= 0 ? product.restockDate?.toISOString() ?? null : null,
    // Le chiffre exact n'est communiqué que lorsqu'il reste peu d'unités.
    lowStockQuantity: status === "low_stock" ? available : null,
  };
}

export async function searchProducts(database: Db, search: ProductSearch, pricing: PricingContext) {
  const perPage = search.limit ?? (await getSetting(database, "00000000-0000-4000-8000-000000000001", "catalog.products_per_page"));
  const conditions: SQL[] = [publicProductCondition(search.q ? "search" : "catalog")];
  if (search.category) {
    const [category] = await database.select({ id: categories.id }).from(categories).where(and(eq(categories.slug, search.category), eq(categories.isActive, true), isNull(categories.deletedAt))).limit(1);
    if (!category) throw errors.notFound("Catégorie", search.category);
    const ids = await categoryWithDescendants(database, category.id);
    conditions.push(or(inArray(products.categoryId, ids), sql`exists (select 1 from product_categories pc where pc.product_id = ${products.id} and pc.category_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`)!);
  }
  if (search.brand) {
    const [brand] = await database.select({ id: brands.id }).from(brands).where(and(eq(brands.slug, search.brand), eq(brands.isActive, true), isNull(brands.deletedAt))).limit(1);
    if (!brand) throw errors.notFound("Marque", search.brand);
    conditions.push(eq(products.brandId, brand.id));
  }
  if (search.q) {
    const pattern = likePattern(search.q);
    const tagMatch = sql`exists (select 1 from ${productTags} t where t.product_id = ${products.id} and t.tag ilike ${pattern})`;
    conditions.push(or(ilike(products.title, pattern), ilike(products.reference, pattern), ilike(products.shortDescription, pattern), tagMatch, isValidEan13(search.q) ? eq(products.ean13, search.q) : undefined)!);
  }
  if (search.minPrice != null) conditions.push(gte(products.priceXof, search.minPrice));
  if (search.maxPrice != null) conditions.push(lte(products.priceXof, search.maxPrice));
  if (search.inStock) conditions.push(or(sql`${products.quantity} > 0`, eq(products.productType, "virtual"))!);
  if (search.featured) conditions.push(eq(products.isFeatured, true));
  if (search.ids) conditions.push(search.ids.length ? inArray(products.id, search.ids) : sql`false`);
  const where = and(...conditions);
  const order = search.sort === "price_asc" ? [asc(products.priceXof)] : search.sort === "price_desc" ? [desc(products.priceXof)] : search.sort === "name" ? [asc(products.title)]
    : search.sort === "relevance" && search.q ? [desc(sql`(${products.title} ilike ${likePattern(search.q)})`), desc(products.isFeatured), desc(products.publishedAt)]
    : [desc(products.isFeatured), desc(products.publishedAt), desc(products.createdAt)];
  const [rows, [total]] = await Promise.all([
    database.select().from(products).where(where).orderBy(...order, asc(products.id)).limit(perPage).offset((search.page - 1) * perPage),
    database.select({ value: count() }).from(products).where(where),
  ]);
  const [coverMap, prices, allowBackorders] = await Promise.all([
    covers(database, rows.map((row) => row.id)),
    priceProducts(database, rows.map((row) => ({ productId: row.id, quantity: 1 })), pricing),
    getSetting(database, "00000000-0000-4000-8000-000000000001", "catalog.allow_out_of_stock_orders"),
  ]);
  const totalCount = Number(total?.value ?? 0);
  return {
    data: rows.map((row, index) => ({
      id: row.id, title: row.title, slug: row.slug, shortDescription: row.shortDescription, reference: row.reference, productType: row.productType, condition: row.condition,
      brandId: row.brandId, categoryId: row.categoryId, isFeatured: row.isFeatured, minimumQuantity: row.minimumQuantity, cover: coverMap.get(row.id) ?? null,
      price: row.showPrice ? publicPrice(prices[index]) : null,
      availability: availability(row, allowBackorders, null),
    })),
    meta: { page: search.page, limit: perPage, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / perPage)), sort: search.sort, filters: { q: search.q ?? null, category: search.category ?? null, brand: search.brand ?? null } },
  };
}

/* ─────────────────────────────  Fiche produit  ───────────────────────────── */

export class RedirectSignal extends AppError {
  constructor(public readonly location: string, public readonly permanent: boolean) {
    super("NOT_FOUND", "Ce produit a changé d'adresse.", { redirectTo: location, permanent });
  }
}

async function redirectFor(executor: Executor, slug: string): Promise<RedirectSignal | null> {
  const [redirect] = await executor.select({ newPath: slugRedirects.newPath }).from(slugRedirects).where(eq(slugRedirects.oldPath, `/produits/${slug}`)).limit(1);
  return redirect ? new RedirectSignal(redirect.newPath, true) : null;
}

/** Produit désactivé avec redirection configurée : cible publique (catégorie, produit ou URL). */
async function disabledRedirect(executor: Executor, product: typeof products.$inferSelect): Promise<RedirectSignal | null> {
  if (!product.redirectType || !product.redirectTargetType) return null;
  const permanent = product.redirectType === "301";
  if (product.redirectTargetType === "url" && product.redirectTarget) return new RedirectSignal(product.redirectTarget, permanent);
  if (product.redirectTargetType === "product" && product.redirectTarget) {
    const [target] = await executor.select({ slug: products.slug }).from(products).where(and(or(eq(products.slug, product.redirectTarget), sql`${products.id}::text = ${product.redirectTarget}`), publicProductCondition())).limit(1);
    if (target) return new RedirectSignal(`/produits/${target.slug}`, permanent);
  }
  const [category] = await executor.select({ slug: categories.slug }).from(categories)
    .where(and(product.redirectTargetType === "category" && product.redirectTarget ? or(eq(categories.slug, product.redirectTarget), sql`${categories.id}::text = ${product.redirectTarget}`) : eq(categories.id, product.categoryId), eq(categories.isActive, true), isNull(categories.deletedAt))).limit(1);
  return category ? new RedirectSignal(`/produits?categorie=${encodeURIComponent(category.slug)}`, permanent) : null;
}

export async function publicProduct(database: Db, slug: string, pricing: PricingContext & { quantity?: number }) {
  const [product] = await database.select().from(products).where(and(eq(products.slug, slug), publicProductCondition())).limit(1);
  if (!product) {
    const redirect = await redirectFor(database, slug);
    if (redirect) throw redirect;
    const [hidden] = await database.select().from(products).where(and(eq(products.slug, slug), isNull(products.deletedAt))).limit(1);
    const disabled = hidden ? await disabledRedirect(database, hidden) : null;
    if (disabled) throw disabled;
    throw errors.notFound("Produit", slug);
  }
  const quantity = Math.max(pricing.quantity ?? 1, product.minimumQuantity);
  const [images, combinations, featureRows, tags, related, attachments, brand, category, allowBackorders, packAvailable] = await Promise.all([
    database.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(asc(productImages.sortOrder), asc(productImages.id)),
    combinationsOf(database, product.id),
    database.select({ name: features.name, value: featureValues.value, customValue: productFeatureValues.customValue }).from(productFeatureValues).innerJoin(features, eq(features.id, productFeatureValues.featureId)).leftJoin(featureValues, eq(featureValues.id, productFeatureValues.featureValueId))
      .where(and(eq(productFeatureValues.productId, product.id), eq(features.isActive, true))).orderBy(asc(features.position)),
    database.select({ tag: productTags.tag }).from(productTags).where(eq(productTags.productId, product.id)).orderBy(asc(productTags.tag)),
    database.select({ id: products.id, title: products.title, slug: products.slug, relationType: relatedProducts.relationType }).from(relatedProducts).innerJoin(products, eq(products.id, relatedProducts.relatedProductId))
      .where(and(eq(relatedProducts.productId, product.id), publicProductCondition())).orderBy(asc(relatedProducts.sortOrder)),
    database.select({ fileName: productAttachments.fileName, url: productAttachments.url, contentType: productAttachments.contentType, sizeBytes: productAttachments.sizeBytes }).from(productAttachments).where(eq(productAttachments.productId, product.id)),
    product.brandId ? database.select({ id: brands.id, name: brands.name, slug: brands.slug, logoUrl: brands.logoUrl }).from(brands).where(and(eq(brands.id, product.brandId), isNull(brands.deletedAt), eq(brands.isActive, true))).limit(1) : Promise.resolve([]),
    publicCategories(database).then((tree) => {
      const walk = (nodes: PublicNode[], trail: PublicNode[]): PublicNode[] | null => {
        for (const node of nodes) {
          if (node.id === product.categoryId) return [...trail, node];
          const found = walk(node.children, [...trail, node]);
          if (found) return found;
        }
        return null;
      };
      return (walk(tree, []) ?? []).map((entry) => ({ id: entry.id, name: entry.name, slug: entry.slug }));
    }),
    getSetting(database, "00000000-0000-4000-8000-000000000001", "catalog.allow_out_of_stock_orders"),
    product.productType === "pack" ? packAvailability(database, product.id) : Promise.resolve(null),
  ]);
  const activeCombinations = combinations.filter((combination) => combination.isActive);
  const prices = await priceProducts(database, [{ productId: product.id, quantity }, ...activeCombinations.map((combination) => ({ productId: product.id, variantId: combination.id, quantity }))], pricing);
  const relatedCovers = await covers(database, related.map((entry) => entry.id));
  const cover = images.find((image) => image.isPrimary) ?? images[0];
  return {
    id: product.id, title: product.title, slug: product.slug, reference: product.reference, ean13: product.ean13, mpn: product.mpn,
    shortDescription: product.shortDescription, description: product.description, productType: product.productType, condition: product.condition,
    brand: brand[0] ?? null, breadcrumb: category, minimumQuantity: product.minimumQuantity, leadTimeDays: product.leadTimeDays, deliveryTimeDays: product.deliveryTimeDays,
    weightGrams: product.weightGrams, dimensionsMm: { length: product.lengthMm, width: product.widthMm, height: product.heightMm }, allowReviews: product.allowReviews,
    unitPrice: product.unitPriceXof && product.unitLabel ? { amountXof: product.unitPriceXof, label: product.unitLabel } : null,
    images: images.map((image) => ({ id: image.id, url: image.url, alt: image.alt, isCover: image.id === cover?.id })),
    price: product.showPrice ? publicPrice(prices[0]) : null,
    availability: availability(product, allowBackorders, packAvailable),
    combinations: activeCombinations.map((combination, index) => ({
      id: combination.id, label: combination.value, sku: combination.sku, isDefault: combination.isDefault, attributes: combination.attributes, imageIds: combination.imageIds,
      price: product.showPrice ? publicPrice(prices[index + 1]) : null,
      availability: availability({ ...product, quantity: combination.quantity, lowStockThreshold: combination.lowStockThreshold }, allowBackorders, null),
    })),
    features: featureRows.map((entry) => ({ name: entry.name, value: entry.customValue ?? entry.value })),
    tags: tags.map((entry) => entry.tag),
    attachments,
    related: related.filter((entry) => entry.relationType === "related").map((entry) => ({ id: entry.id, title: entry.title, slug: entry.slug, cover: relatedCovers.get(entry.id) ?? null })),
    accessories: related.filter((entry) => entry.relationType === "accessory").map((entry) => ({ id: entry.id, title: entry.title, slug: entry.slug, cover: relatedCovers.get(entry.id) ?? null })),
    seo: { title: product.seoTitle ?? product.title, description: product.seoDescription ?? product.shortDescription, canonicalPath: product.canonicalPath ?? `/produits/${product.slug}`, openGraphImageUrl: product.openGraphImageUrl ?? cover?.url ?? null },
  };
}

/** Résolution d'une ancienne URL produit (utilisée par la page produit de la boutique). */
export async function resolveProductRedirect(executor: Executor, slug: string): Promise<{ location: string; permanent: boolean } | null> {
  const redirect = await redirectFor(executor, slug);
  if (redirect) return { location: redirect.location, permanent: true };
  const [hidden] = await executor.select().from(products).where(and(eq(products.slug, slug), isNull(products.deletedAt))).limit(1);
  if (!hidden) return null;
  const [visible] = await executor.select({ id: products.id }).from(products).where(and(eq(products.id, hidden.id), publicProductCondition())).limit(1);
  if (visible) return null;
  const disabled = await disabledRedirect(executor, hidden);
  return disabled ? { location: disabled.location, permanent: disabled.permanent } : null;
}
