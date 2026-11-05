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
import { foldText, prefixTsQuery, searchTokens } from "@/lib/search";
import {
  brands, categories, orderItems, orders, productAttachments, productFeatureValues, productImages, productTags, products, relatedProducts, sellerProfiles, slugRedirects, users,
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
  sort: "relevance" | "newest" | "price_asc" | "price_desc" | "name" | "best_selling";
  /** Sélection explicite (blocs de pages CMS). */
  ids?: string[];
  /** Valeurs de caractéristiques cochées : « ou » au sein d'une caractéristique, « et » entre caractéristiques. */
  features?: string[];
  /** Ajoute les facettes (catégories, marques, prix, stock, caractéristiques) à `meta`. */
  facets?: boolean;
};

/* Recherche plein texte : document indexé (titre, référence, résumé, description) en français sans accents,
   préfixes (« chaus » trouve « chaussures »), sous-chaîne du titre, référence, étiquettes et EAN.
   Si rien ne correspond, une seconde passe tolère les fautes de frappe (trigrammes sur le titre). */
const SEARCH_DOCUMENT = sql`public.mbm_product_document(${products.title}, ${products.reference}, ${products.shortDescription}, ${products.description})`;
const FOLDED_TITLE = sql`public.mbm_unaccent(lower(${products.title}))`;

type TextQuery = { raw: string; folded: string; tsQuery: string; contains: string; prefix: string };

function textQuery(q: string): TextQuery | null {
  const tokens = searchTokens(q);
  const folded = foldText(q);
  if (!folded) return null;
  const escaped = folded.replace(/[\\%_]/g, (character) => `\\${character}`);
  return { raw: q, folded, tsQuery: prefixTsQuery(tokens), contains: `%${escaped}%`, prefix: `${escaped}%` };
}

function strictTextCondition(text: TextQuery): SQL {
  const pattern = likePattern(text.raw);
  return or(
    text.tsQuery ? sql`${SEARCH_DOCUMENT} @@ to_tsquery('french', ${text.tsQuery})` : undefined,
    sql`${FOLDED_TITLE} like ${text.contains}`,
    ilike(products.reference, pattern),
    sql`exists (select 1 from ${productTags} t where t.product_id = ${products.id} and public.mbm_unaccent(lower(t.tag)) like ${text.contains})`,
    isValidEan13(text.raw) ? eq(products.ean13, text.raw) : undefined,
  )!;
}

/** Fautes de frappe : similarité de mots (pg_trgm, seuil 0,6) entre la requête et le titre. */
function fuzzyTextCondition(text: TextQuery): SQL {
  return sql`${text.folded} <% ${FOLDED_TITLE}`;
}

function relevanceScore(text: TextQuery): SQL {
  const parts = [
    sql`word_similarity(${text.folded}, ${FOLDED_TITLE})`,
    sql`(case when ${FOLDED_TITLE} like ${text.prefix} then 1 else 0 end)`,
    sql`(case when lower(${products.reference}) = ${text.folded} then 2 else 0 end)`,
  ];
  if (text.tsQuery) parts.push(sql`ts_rank_cd(${SEARCH_DOCUMENT}, to_tsquery('french', ${text.tsQuery}))`);
  return sql.join(parts, sql` + `);
}

/** Commandes comptées comme ventes : payées ou confirmées (paiement à la livraison), jusqu'au versement au vendeur. */
const SOLD_STATUSES = ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"] as const;
const UNITS_SOLD = sql`(select coalesce(sum(oi.quantity - oi.returned_quantity), 0) from ${orderItems} oi join ${orders} o on o.id = oi.order_id
  where oi.product_id = ${products.id} and o.deleted_at is null and o.status in (${sql.join(SOLD_STATUSES.map((status) => sql`${status}`), sql`, `)}))`;

/** Tranches de prix (XOF, prix catalogue HT) proposées en facette. */
const PRICE_RANGES: Array<[number, number | null]> = [[0, 5_000], [5_000, 10_000], [10_000, 25_000], [25_000, 50_000], [50_000, 100_000], [100_000, 250_000], [250_000, null]];

type FacetKey = "category" | "brand" | "price" | "stock";
type Filters = { base: SQL[]; text?: SQL; parts: Partial<Record<FacetKey, SQL>>; features: Map<string, SQL> };

/** Conditions combinées ; une facette ignore son propre filtre pour afficher les autres choix possibles. */
function whereOf(filters: Filters, options: { except?: FacetKey; exceptFeature?: string | "all" } = {}): SQL {
  const conditions = [...filters.base];
  if (filters.text) conditions.push(filters.text);
  for (const [key, condition] of Object.entries(filters.parts) as Array<[FacetKey, SQL]>) if (key !== options.except) conditions.push(condition);
  for (const [featureId, condition] of filters.features) if (options.exceptFeature !== "all" && options.exceptFeature !== featureId) conditions.push(condition);
  return and(...conditions)!;
}

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

async function buildFilters(database: Db, search: ProductSearch, text: TextQuery | null): Promise<Filters> {
  const filters: Filters = { base: [publicProductCondition(search.q ? "search" : "catalog")], parts: {}, features: new Map() };
  if (search.category) {
    const [category] = await database.select({ id: categories.id }).from(categories).where(and(eq(categories.slug, search.category), eq(categories.isActive, true), isNull(categories.deletedAt))).limit(1);
    if (!category) throw errors.notFound("Catégorie", search.category);
    const ids = await categoryWithDescendants(database, category.id);
    filters.parts.category = or(inArray(products.categoryId, ids), sql`exists (select 1 from product_categories pc where pc.product_id = ${products.id} and pc.category_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`)!;
  }
  if (search.brand) {
    const [brand] = await database.select({ id: brands.id }).from(brands).where(and(eq(brands.slug, search.brand), eq(brands.isActive, true), isNull(brands.deletedAt))).limit(1);
    if (!brand) throw errors.notFound("Marque", search.brand);
    filters.parts.brand = eq(products.brandId, brand.id);
  }
  if (text) filters.text = strictTextCondition(text);
  else if (search.q) filters.text = sql`false`;
  if (search.minPrice != null || search.maxPrice != null) {
    filters.parts.price = and(search.minPrice != null ? gte(products.priceXof, search.minPrice) : undefined, search.maxPrice != null ? lte(products.priceXof, search.maxPrice) : undefined)!;
  }
  if (search.inStock) filters.parts.stock = or(sql`${products.quantity} > 0`, eq(products.productType, "virtual"))!;
  if (search.featured) filters.base.push(eq(products.isFeatured, true));
  if (search.ids) filters.base.push(search.ids.length ? inArray(products.id, search.ids) : sql`false`);
  if (search.features?.length) {
    // Valeurs inconnues ou désactivées ignorées (ancien lien) ; regroupées par caractéristique.
    const values = await database.select({ id: featureValues.id, featureId: featureValues.featureId }).from(featureValues)
      .innerJoin(features, and(eq(features.id, featureValues.featureId), eq(features.isActive, true))).where(inArray(featureValues.id, search.features));
    const byFeature = new Map<string, string[]>();
    for (const value of values) byFeature.set(value.featureId, [...(byFeature.get(value.featureId) ?? []), value.id]);
    for (const [featureId, valueIds] of byFeature) {
      filters.features.set(featureId, sql`exists (select 1 from ${productFeatureValues} pfv where pfv.product_id = ${products.id} and pfv.feature_value_id in (${sql.join(valueIds.map((id) => sql`${id}`), sql`, `)}))`);
    }
  }
  return filters;
}

function orderOf(sort: ProductSearch["sort"], text: TextQuery | null): SQL[] {
  switch (sort) {
    case "price_asc": return [asc(products.priceXof)];
    case "price_desc": return [desc(products.priceXof)];
    case "name": return [asc(products.title)];
    case "best_selling": return [desc(UNITS_SOLD), desc(products.isFeatured), desc(products.publishedAt)];
    case "relevance": if (text) return [desc(relevanceScore(text)), desc(products.isFeatured), desc(products.publishedAt)];
  }
  return [desc(products.isFeatured), desc(products.publishedAt), desc(products.createdAt)];
}

export async function searchProducts(database: Db, search: ProductSearch, pricing: PricingContext) {
  const perPage = search.limit ?? (await getSetting(database, "00000000-0000-4000-8000-000000000001", "catalog.products_per_page"));
  const text = search.q ? textQuery(search.q) : null;
  let filters = await buildFilters(database, search, text);
  let [{ value: total }] = await database.select({ value: count() }).from(products).where(whereOf(filters));
  let fuzzy = false;
  if (text && Number(total) === 0) {
    // Aucun résultat exact : seconde passe tolérante aux fautes de frappe sur le titre.
    filters = { ...filters, text: fuzzyTextCondition(text) };
    [{ value: total }] = await database.select({ value: count() }).from(products).where(whereOf(filters));
    fuzzy = Number(total) > 0;
  }
  const where = whereOf(filters);
  const rows = await database.select().from(products).where(where).orderBy(...orderOf(search.sort, text), asc(products.id)).limit(perPage).offset((search.page - 1) * perPage);
  const [coverMap, prices, allowBackorders, facets] = await Promise.all([
    covers(database, rows.map((row) => row.id)),
    priceProducts(database, rows.map((row) => ({ productId: row.id, quantity: 1 })), pricing),
    getSetting(database, "00000000-0000-4000-8000-000000000001", "catalog.allow_out_of_stock_orders"),
    search.facets ? productFacets(database, filters, search) : Promise.resolve(undefined),
  ]);
  const totalCount = Number(total ?? 0);
  return {
    data: rows.map((row, index) => ({
      id: row.id, title: row.title, slug: row.slug, shortDescription: row.shortDescription, reference: row.reference, productType: row.productType, condition: row.condition,
      brandId: row.brandId, categoryId: row.categoryId, isFeatured: row.isFeatured, minimumQuantity: row.minimumQuantity, cover: coverMap.get(row.id) ?? null,
      price: row.showPrice ? publicPrice(prices[index]) : null,
      availability: availability(row, allowBackorders, null),
    })),
    meta: {
      page: search.page, limit: perPage, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / perPage)), sort: search.sort,
      filters: {
        q: search.q ?? null, category: search.category ?? null, brand: search.brand ?? null, minPrice: search.minPrice ?? null, maxPrice: search.maxPrice ?? null,
        inStock: search.inStock ?? false, features: search.features ?? [],
      },
      /** Vrai si les résultats viennent de la passe tolérante aux fautes de frappe. */
      fuzzy,
      ...(facets ? { facets } : {}),
    },
  };
}

/* ─────────────────────────────  Facettes  ───────────────────────────── */

async function productFacets(database: Db, filters: Filters, search: ProductSearch) {
  const priceColumns = Object.fromEntries(PRICE_RANGES.map(([min, max], index) => [`r${index}`,
    sql<number>`(count(*) filter (where ${products.priceXof} >= ${min}${max == null ? sql`` : sql` and ${products.priceXof} < ${max}`}))::int`])) as Record<string, SQL<number>>;
  const selected = new Set(search.features ?? []);
  const featureQuery = (where: SQL, onlyFeature?: string) => database
    .select({ featureId: features.id, code: features.code, name: features.name, featurePosition: features.position, valueId: featureValues.id, value: featureValues.value, valuePosition: featureValues.position, count: sql<number>`count(distinct ${products.id})::int` })
    .from(products)
    .innerJoin(productFeatureValues, eq(productFeatureValues.productId, products.id))
    .innerJoin(features, and(eq(features.id, productFeatureValues.featureId), eq(features.isActive, true)))
    .innerJoin(featureValues, eq(featureValues.id, productFeatureValues.featureValueId))
    .where(and(where, onlyFeature ? eq(features.id, onlyFeature) : filters.features.size ? sql`${features.id} not in (${sql.join([...filters.features.keys()].map((id) => sql`${id}`), sql`, `)})` : undefined))
    .groupBy(features.id, featureValues.id);
  const [categoryRows, brandRows, [priceRow], [stockRow], ...featureGroups] = await Promise.all([
    database.select({ id: categories.id, name: categories.name, slug: categories.slug, count: sql<number>`count(*)::int` }).from(products)
      .innerJoin(categories, and(eq(categories.id, products.categoryId), eq(categories.isActive, true), isNull(categories.deletedAt)))
      .where(whereOf(filters, { except: "category" })).groupBy(categories.id).orderBy(desc(sql`count(*)`), asc(categories.name)).limit(30),
    database.select({ id: brands.id, name: brands.name, slug: brands.slug, count: sql<number>`count(*)::int` }).from(products)
      .innerJoin(brands, and(eq(brands.id, products.brandId), eq(brands.isActive, true), isNull(brands.deletedAt)))
      .where(whereOf(filters, { except: "brand" })).groupBy(brands.id).orderBy(desc(sql`count(*)`), asc(brands.name)).limit(30),
    database.select({ min: sql<number | null>`min(${products.priceXof})`, max: sql<number | null>`max(${products.priceXof})`, ...priceColumns }).from(products).where(whereOf(filters, { except: "price" })),
    database.select({ total: sql<number>`count(*)::int`, inStock: sql<number>`(count(*) filter (where ${products.quantity} > 0 or ${products.productType} = 'virtual'))::int` }).from(products).where(whereOf(filters, { except: "stock" })),
    // Caractéristiques sans valeur cochée : tous les filtres ; caractéristique cochée : tous sauf elle-même.
    featureQuery(whereOf(filters)),
    ...[...filters.features.keys()].map((featureId) => featureQuery(whereOf(filters, { exceptFeature: featureId }), featureId)),
  ]);
  const featureMap = new Map<string, { id: string; code: string; name: string; position: number; values: Array<{ id: string; value: string; position: number; count: number; selected: boolean }> }>();
  for (const row of featureGroups.flat()) {
    const entry = featureMap.get(row.featureId) ?? { id: row.featureId, code: row.code, name: row.name, position: row.featurePosition, values: [] };
    entry.values.push({ id: row.valueId, value: row.value, position: row.valuePosition, count: Number(row.count), selected: selected.has(row.valueId) });
    featureMap.set(row.featureId, entry);
  }
  return {
    categories: categoryRows.map((row) => ({ ...row, count: Number(row.count), selected: row.slug === search.category })),
    brands: brandRows.map((row) => ({ ...row, count: Number(row.count), selected: row.slug === search.brand })),
    price: {
      min: priceRow?.min == null ? null : Number(priceRow.min), max: priceRow?.max == null ? null : Number(priceRow.max),
      ranges: PRICE_RANGES.map(([min, max], index) => ({ min, max, count: Number((priceRow as Record<string, unknown> | undefined)?.[`r${index}`] ?? 0) })).filter((range) => range.count > 0),
    },
    availability: { total: Number(stockRow?.total ?? 0), inStock: Number(stockRow?.inStock ?? 0), selected: search.inStock ?? false },
    features: [...featureMap.values()]
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "fr"))
      .slice(0, 15)
      .map((feature) => ({
        id: feature.id, code: feature.code, name: feature.name,
        values: feature.values.sort((a, b) => a.position - b.position || a.value.localeCompare(b.value, "fr")).slice(0, 30).map((value) => ({ id: value.id, value: value.value, count: value.count, selected: value.selected })),
      })),
  };
}

/* ─────────────────────────────  Suggestions  ───────────────────────────── */

/** Suggestions pendant la saisie : quelques produits (même règle que la recherche), catégories et marques. */
export async function searchSuggestions(database: Db, q: string) {
  const text = textQuery(q);
  if (!text) return { query: q, fuzzy: false, products: [], categories: [], brands: [] };
  const visible = publicProductCondition("search");
  const productQuery = (condition: SQL) => database.select({ id: products.id, title: products.title, slug: products.slug }).from(products)
    .where(and(visible, condition)).orderBy(desc(relevanceScore(text)), desc(products.isFeatured), asc(products.id)).limit(6);
  let productRows = await productQuery(strictTextCondition(text));
  let fuzzy = false;
  if (!productRows.length) { productRows = await productQuery(fuzzyTextCondition(text)); fuzzy = productRows.length > 0; }
  const [coverMap, categoryRows, brandRows] = await Promise.all([
    covers(database, productRows.map((row) => row.id)),
    database.select({ name: categories.name, slug: categories.slug }).from(categories)
      .where(and(eq(categories.isActive, true), isNull(categories.deletedAt), sql`public.mbm_unaccent(lower(${categories.name})) like ${text.contains}`)).orderBy(asc(categories.name)).limit(4),
    database.select({ name: brands.name, slug: brands.slug }).from(brands)
      .where(and(eq(brands.isActive, true), isNull(brands.deletedAt), sql`public.mbm_unaccent(lower(${brands.name})) like ${text.contains}`)).orderBy(asc(brands.name)).limit(4),
  ]);
  return {
    query: q, fuzzy,
    products: productRows.map((row) => ({ title: row.title, slug: row.slug, cover: coverMap.get(row.id) ?? null })),
    categories: categoryRows, brands: brandRows,
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
