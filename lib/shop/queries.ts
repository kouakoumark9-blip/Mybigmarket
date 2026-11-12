import "server-only";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands, categories, productImages, products } from "@/lib/db/schema";
import { availabilityLabel, isInStock } from "./availability";
import { discountPercent } from "./format";
import type { ProductFilters, ShopCategory, ShopProduct } from "./types";

const hasDb = () => Boolean(process.env.DATABASE_URL);

/** Une panne de base ne doit pas faire tomber la vitrine : on journalise et on affiche une page vide. */
async function safely<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  if (!hasDb()) return fallback;
  try { return await run(); } catch (error) {
    console.error(`[boutique] ${label} :`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

/**
 * Lectures de la vitrine mises en cache 60 s côté serveur (étiquette « boutique ») : les pages ne relisent pas la base
 * à chaque visite, ce qui évite aussi le réveil de la base après une période d'inactivité.
 * Une erreur n'est jamais mise en cache. Les modifications faites dans /gestion vident le cache tout de suite.
 */
export const SHOP_CACHE_TAG = "boutique";
const cacheOptions = { revalidate: 60, tags: [SHOP_CACHE_TAG] };

/* ───────── Catégories ───────── */

export async function getCategoryTree(): Promise<ShopCategory[]> {
  return safely("catégories", [], () => cachedCategoryTree());
}

const cachedCategoryTree = unstable_cache(async (): Promise<ShopCategory[]> => {
  {
    const rows = await getDb().select().from(categories).where(and(eq(categories.isActive, true), isNull(categories.deletedAt))).orderBy(asc(categories.sortOrder), asc(categories.name));
    const byId = new Map<number, ShopCategory>();
    for (const row of rows) byId.set(row.id, { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, imageUrl: row.imageUrl, sortOrder: row.sortOrder, metaTitle: row.metaTitle, metaDescription: row.metaDescription, introText: row.introText, bodyText: row.bodyText, faq: row.faq ?? [], children: [] });
    const roots: ShopCategory[] = [];
    for (const category of byId.values()) {
      const parent = category.parentId ? byId.get(category.parentId) : undefined;
      if (parent) parent.children.push(category); else if (category.sortOrder < 90) roots.push(category);
    }
    return roots;
  }
}, ["boutique-categories"], cacheOptions);

/** Catégorie par chemin propre (« lits » ou « lits/lits-2-places »). */
export async function getCategoryByPath(path: string): Promise<{ category: ShopCategory; parent: ShopCategory | null } | null> {
  const tree = await getCategoryTree();
  for (const root of tree) {
    if (root.slug === path) return { category: root, parent: null };
    const child = root.children.find((item) => item.slug === path);
    if (child) return { category: child, parent: root };
  }
  return null;
}

export const categoryIdsOf = (category: ShopCategory) => [category.id, ...category.children.map((child) => child.id)];
export const categoryHref = (slug: string) => `/${slug}`;

/* ───────── Produits ───────── */

type Row = { product: typeof products.$inferSelect; category: typeof categories.$inferSelect; brand: string | null; image: string | null };

function toShopProduct({ product, category, brand, image }: Row): ShopProduct {
  return {
    id: product.id, slug: product.slug, title: product.title, shortDescription: product.shortDescription,
    priceXof: product.priceXof, comparePriceXof: product.comparePriceXof, discountPercent: discountPercent(product.priceXof, product.comparePriceXof),
    quantity: product.quantity, availability: product.availability, leadTimeDays: product.leadTimeDays,
    availabilityLabel: availabilityLabel(product.availability, product.leadTimeDays), inStock: isInStock(product.availability, product.quantity),
    badge: product.badge, isBestSeller: product.isBestSeller, isPlaceholder: product.isPlaceholder,
    powerLabel: product.powerLabel, energyClass: product.energyClass, brand,
    image, categoryName: category.name, categorySlug: category.slug, createdAt: product.createdAt,
  };
}

const visible = and(eq(products.status, "approved"), isNull(products.deletedAt));

/** Produit rangé dans l'une de ces catégories : catégorie principale ou catégorie supplémentaire (table product_categories). */
const inCategories = (ids: number[]): SQL => or(
  inArray(products.categoryId, ids),
  sql`exists (select 1 from product_categories pc where pc.product_id = ${products.id} and pc.category_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}))`,
)!;

function orderBy(sort: ProductFilters["sort"]) {
  switch (sort) {
    case "prix-croissant": return [asc(products.priceXof)];
    case "prix-decroissant": return [desc(products.priceXof)];
    case "nouveautes": return [desc(products.createdAt)];
    default: return [desc(products.isBestSeller), desc(products.isFeatured), desc(products.createdAt)];
  }
}

function conditions(filters: ProductFilters): SQL[] {
  const list: SQL[] = [visible!];
  if (filters.slugs?.length) list.push(inArray(products.slug, filters.slugs));
  if (filters.categoryIds?.length) list.push(inCategories(filters.categoryIds));
  if (filters.q) { const term = `%${filters.q.replace(/[%_]/g, " ").trim()}%`; list.push(or(ilike(products.title, term), ilike(products.shortDescription, term), ilike(products.description, term))!); }
  if (filters.brand) list.push(eq(brands.slug, filters.brand));
  if (filters.power) list.push(eq(products.powerLabel, filters.power));
  if (filters.minPrice) list.push(sql`${products.priceXof} >= ${filters.minPrice}`);
  if (filters.maxPrice) list.push(sql`${products.priceXof} <= ${filters.maxPrice}`);
  if (filters.stock === "in_stock") list.push(and(eq(products.availability, "in_stock_abidjan"), gt(products.quantity, 0))!);
  if (filters.stock === "on_order") list.push(eq(products.availability, "on_order"));
  if (filters.flag === "best") list.push(eq(products.isBestSeller, true));
  if (filters.flag === "promo") list.push(sql`${products.comparePriceXof} > ${products.priceXof}`);
  return list;
}

export async function listProducts(filters: ProductFilters = {}): Promise<{ items: ShopProduct[]; total: number }> {
  return safely("produits", { items: [], total: 0 }, () => cachedProducts(filters));
}

const cachedProducts = unstable_cache(async (filters: ProductFilters): Promise<{ items: ShopProduct[]; total: number }> => {
  {
    const db = getDb();
    const where = and(...conditions(filters));
    const size = filters.limit ?? filters.pageSize ?? 20;
    const offset = filters.limit ? 0 : Math.max(0, ((filters.page ?? 1) - 1) * size);
    const rows = await db.select({ product: products, category: categories, brand: brands.name }).from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId)).leftJoin(brands, eq(brands.id, products.brandId))
      .where(where).orderBy(...orderBy(filters.sort)).limit(size).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(products).innerJoin(categories, eq(categories.id, products.categoryId)).leftJoin(brands, eq(brands.id, products.brandId)).where(where);
    const images = rows.length ? await db.select().from(productImages).where(inArray(productImages.productId, rows.map((row) => row.product.id))).orderBy(asc(productImages.sortOrder)) : [];
    const first = new Map<string, string>();
    for (const image of images) if (!first.has(image.productId)) first.set(image.productId, image.url);
    return { items: rows.map((row) => toShopProduct({ ...row, image: first.get(row.product.id) ?? null })), total };
  }
}, ["boutique-produits"], cacheOptions);

/** Marques et puissances présentes dans une sélection de catégories, pour les filtres. */
export async function listFilterOptions(categoryIds: number[]) {
  return safely("filtres", { brands: [] as Array<{ slug: string; name: string }>, powers: [] as string[], maxPrice: 0 }, () => cachedFilterOptions(categoryIds));
}

const cachedFilterOptions = unstable_cache(async (categoryIds: number[]) => {
  {
    const db = getDb();
    const rows = await db.select({ brandSlug: brands.slug, brandName: brands.name, power: products.powerLabel, price: products.priceXof }).from(products)
      .leftJoin(brands, eq(brands.id, products.brandId)).where(and(visible, categoryIds.length ? inCategories(categoryIds) : undefined));
    const brandMap = new Map<string, string>();
    const powers = new Set<string>();
    let maxPrice = 0;
    for (const row of rows) { if (row.brandSlug && row.brandName) brandMap.set(row.brandSlug, row.brandName); if (row.power) powers.add(row.power); maxPrice = Math.max(maxPrice, row.price); }
    return { brands: [...brandMap].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, "fr")), powers: [...powers].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })), maxPrice };
  }
}, ["boutique-filtres"], cacheOptions);

export async function listAllProductSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  return safely("sitemap produits", [], async () => getDb().select({ slug: products.slug, updatedAt: products.updatedAt }).from(products).where(visible));
}

/** Photo ronde de chaque catégorie (menu du bas sur téléphone) : celle du premier produit de la catégorie, ou rien. */
export async function getCategoryThumbs(tree: ShopCategory[]): Promise<Record<string, string | null>> {
  const all = tree.flatMap((category) => [category, ...category.children]);
  const entries = await Promise.all(all.map(async (category) => {
    const { items } = await listProducts({ categoryIds: categoryIdsOf(category), limit: 1 });
    const image = items[0]?.image;
    return [category.slug, image && !image.endsWith(".svg") ? image : null] as const;
  }));
  return Object.fromEntries(entries);
}
