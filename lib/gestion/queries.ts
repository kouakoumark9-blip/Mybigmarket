import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands, categories, productAttributes, productImages, products } from "@/lib/db/schema";
import { specsToText } from "./products";
import type { ProductFormValues } from "@/components/gestion/product-form";

/** Catégories pour les listes déroulantes : « Climatiseurs › Climatiseurs inverter ». */
export async function categoryOptions() {
  const rows = await getDb().select({ id: categories.id, name: categories.name, parentId: categories.parentId, sort: categories.sortOrder }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  const name = new Map(rows.map((row) => [row.id, row.name]));
  return rows.filter((row) => row.sort < 90).map((row) => ({ id: row.id, label: row.parentId ? `${name.get(row.parentId)} › ${row.name}` : row.name })).sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export async function productFormValues(id: string): Promise<ProductFormValues | null> {
  const db = getDb();
  const [row] = await db.select({ product: products, brand: brands.name }).from(products).leftJoin(brands, eq(brands.id, products.brandId)).where(eq(products.id, id)).limit(1);
  if (!row) return null;
  const [images, attributes] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productAttributes).where(eq(productAttributes.productId, id)).orderBy(asc(productAttributes.sortOrder)),
  ]);
  const p = row.product;
  return {
    id: p.id, title: p.title, slug: p.slug, categoryId: p.categoryId, brand: row.brand ?? "", priceXof: p.priceXof, comparePriceXof: p.comparePriceXof ?? "", quantity: p.quantity, availability: p.availability, leadTimeDays: p.leadTimeDays,
    powerLabel: p.powerLabel ?? "", energyClass: p.energyClass ?? "", badge: p.badge ?? "", isBestSeller: p.isBestSeller, isPlaceholder: p.isPlaceholder, status: p.status, shortDescription: p.shortDescription ?? "", description: p.description,
    specs: specsToText(attributes.map((attribute) => ({ name: attribute.name, value: attribute.value }))), alibabaUrl: p.alibabaUrl ?? "", purchasePriceXof: p.purchasePriceXof ?? "", importFeesXof: p.importFeesXof ?? "",
    seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", images: images.map((image) => ({ id: image.id, url: image.url })),
  };
}
