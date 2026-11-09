import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands, categories, productAttributes, productImages, products } from "@/lib/db/schema";
import type { DemoProduct } from "@/lib/demo-data";
import { availabilityLabel } from "@/lib/shop/availability";

/**
 * Catalogue public lu par la fiche produit : uniquement les produits publiés en base.
 * Aucun produit d'exemple n'est ajouté. Une panne de base est journalisée et donne un catalogue vide.
 */
export async function getCatalogProducts(): Promise<DemoProduct[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await queryCatalog();
  } catch (error) {
    console.error("[catalog] Base injoignable :", error instanceof Error ? error.message : error);
    return [];
  }
}

async function queryCatalog(): Promise<DemoProduct[]> {
  const db = getDb();
  const rows = await db.select({ product: products, category: categories, brand: brands.name }).from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId)).leftJoin(brands, eq(brands.id, products.brandId))
    .where(and(eq(products.status, "approved"), isNull(products.deletedAt))).limit(500);
  if (!rows.length) return [];
  const ids = rows.map((row) => row.product.id);
  const [images, attributes] = await Promise.all([
    db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productAttributes).where(inArray(productAttributes.productId, ids)).orderBy(asc(productAttributes.sortOrder)),
  ]);
  const allCategories = new Map((await db.select().from(categories)).map((row) => [row.id, row]));
  const trailOf = (categoryId: number) => {
    const trail: Array<{ label: string; href: string }> = [];
    for (let row = allCategories.get(categoryId); row; row = row.parentId ? allCategories.get(row.parentId) : undefined) trail.unshift({ label: row.name, href: `/${row.slug}` });
    return trail;
  };
  const imageMap = new Map<string, string[]>();
  for (const image of images) imageMap.set(image.productId, [...(imageMap.get(image.productId) ?? []), image.url]);
  const attributeMap = new Map<string, Array<{ label: string; value: string }>>();
  for (const attribute of attributes) attributeMap.set(attribute.productId, [...(attributeMap.get(attribute.productId) ?? []), { label: attribute.name, value: attribute.value }]);
  return rows.map(({ product, category, brand }) => ({
    slug: product.slug, title: product.title, description: product.description, priceXof: product.priceXof,
    minimumQuantity: product.minimumQuantity, leadTimeDays: product.leadTimeDays,
    category: category.name, categorySlug: category.slug,
    seller: "MyBigMarket", sellerSlug: "mybigmarket", university: "Boutique en ligne", city: "Abidjan",
    rating: 0, reviewCount: 0, icon: "", tone: "sand", quantity: product.quantity,
    imageUrl: imageMap.get(product.id)?.[0], images: imageMap.get(product.id) ?? [],
    comparePriceXof: product.comparePriceXof, availability: product.availability,
    availabilityLabel: availabilityLabel(product.availability, product.leadTimeDays),
    powerLabel: product.powerLabel, energyClass: product.energyClass, badge: product.badge,
    isPlaceholder: product.isPlaceholder, shortDescription: product.shortDescription, brandName: brand, categoryTrail: trailOf(product.categoryId),
    extraAttributes: attributeMap.get(product.id) ?? [],
  }));
}

export async function getCatalogProduct(slug: string): Promise<DemoProduct | undefined> {
  return (await getCatalogProducts()).find((product) => product.slug === slug);
}
