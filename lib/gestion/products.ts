import "server-only";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { brands, categories, productAttributes, productImages, products } from "@/lib/db/schema";

export const slugify = (value: string) => value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "produit";

const optionalInt = z.preprocess((value) => (value === "" || value == null ? undefined : Number(String(value).replace(/[\s ]/g, ""))), z.number().int().min(0).max(1_000_000_000).optional());
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);

export const productSchema = z.object({
  title: z.string().trim().min(3, "Le nom du produit est trop court.").max(190),
  slug: optionalText(200),
  categoryId: z.coerce.number().int().positive("Choisissez une catégorie."),
  brand: optionalText(120),
  priceXof: z.preprocess((value) => Number(String(value ?? "").replace(/[\s ]/g, "")), z.number().int().min(0, "Le prix est invalide.").max(1_000_000_000)),
  comparePriceXof: optionalInt,
  quantity: z.preprocess((value) => (value === "" || value == null ? 0 : Number(value)), z.number().int().min(0).max(1_000_000)),
  availability: z.enum(["in_stock_abidjan", "on_order"]),
  leadTimeDays: z.preprocess((value) => (value === "" || value == null ? 20 : Number(value)), z.number().int().min(1).max(365)),
  powerLabel: optionalText(40),
  energyClass: optionalText(4),
  badge: optionalText(30),
  isBestSeller: z.coerce.boolean().default(false),
  isPlaceholder: z.coerce.boolean().default(false),
  status: z.enum(["approved", "draft"]).default("approved"),
  shortDescription: optionalText(320),
  description: z.string().trim().min(1, "Ajoutez une description.").max(20000),
  specs: z.string().max(5000).optional().default(""),
  alibabaUrl: z.string().trim().max(500).optional().transform((value) => value || undefined).refine((value) => !value || /^https?:\/\//i.test(value), "Le lien Alibaba doit commencer par https://"),
  purchasePriceXof: optionalInt,
  importFeesXof: optionalInt,
  seoTitle: optionalText(190),
  seoDescription: optionalText(320),
});
export type ProductInput = z.infer<typeof productSchema>;

/** « Puissance : 12 000 BTU » par ligne → paires nom / valeur. */
export function parseSpecs(text: string): Array<{ name: string; value: string }> {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const index = line.indexOf(":");
    return index > 0 ? { name: line.slice(0, index).trim().slice(0, 120), value: line.slice(index + 1).trim() } : { name: "Caractéristique", value: line };
  }).filter((item) => item.value).slice(0, 40);
}

export const specsToText = (items: Array<{ name: string; value: string }>) => items.map((item) => `${item.name} : ${item.value}`).join("\n");

async function brandId(name: string | undefined) {
  if (!name) return null;
  const db = getDb();
  const slug = slugify(name);
  const [existing] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, slug)).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(brands).values({ name, slug }).returning({ id: brands.id });
  return created.id;
}

async function uniqueSlug(base: string, exceptId?: string) {
  const db = getDb();
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const [clash] = await db.select({ id: products.id }).from(products).where(and(eq(products.slug, candidate), exceptId ? ne(products.id, exceptId) : undefined)).limit(1);
    if (!clash) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Vendeuse de la boutique : propriétaire de tous les produits. */
async function shopSellerId() {
  const result = await getDb().execute<{ id: string }>(sql`select u.id from users u join seller_profiles sp on sp.user_id = u.id where u.email = 'boutique@mybigmarket.ci' limit 1`);
  const row = (result as unknown as Array<{ id: string }>)[0];
  if (!row) throw new Error("Compte boutique introuvable : appliquez les migrations de la base.");
  return row.id;
}

export async function saveProduct(id: string | null, input: ProductInput, newImages: Array<{ url: string; alt: string }>, removeImageIds: number[] = []) {
  const db = getDb();
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId)).limit(1);
  if (!category) throw new Error("Catégorie inconnue.");
  const slug = await uniqueSlug(slugify(input.slug || input.title), id ?? undefined);
  const values = {
    title: input.title, slug, categoryId: input.categoryId, brandId: await brandId(input.brand), priceXof: input.priceXof, comparePriceXof: input.comparePriceXof && input.comparePriceXof > input.priceXof ? input.comparePriceXof : null,
    quantity: input.quantity, availability: input.availability, leadTimeDays: input.leadTimeDays, powerLabel: input.powerLabel ?? null, energyClass: input.energyClass ?? null, badge: input.badge ?? null,
    isBestSeller: input.isBestSeller, isPlaceholder: input.isPlaceholder, status: input.status, shortDescription: input.shortDescription ?? null, description: input.description,
    alibabaUrl: input.alibabaUrl ?? null, purchasePriceXof: input.purchasePriceXof ?? null, importFeesXof: input.importFeesXof ?? null, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null,
    publishedAt: input.status === "approved" ? new Date() : null, updatedAt: new Date(),
  };
  // Une seule connexion est ouverte vers la base : tout ce qui n'est pas dans la transaction se calcule avant elle.
  const sellerId = id ? null : await shopSellerId();
  return db.transaction(async (tx) => {
    let productId = id;
    if (id) await tx.update(products).set(values).where(eq(products.id, id));
    else [{ id: productId }] = await tx.insert(products).values({ ...values, sellerId: sellerId! }).returning({ id: products.id });
    if (!productId) throw new Error("Enregistrement impossible.");
    if (removeImageIds.length) for (const imageId of removeImageIds) await tx.delete(productImages).where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));
    const existing = await tx.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(productImages.sortOrder);
    let next = existing.length ? Math.max(...existing.map((image) => image.sortOrder)) + 1 : 0;
    for (const image of newImages) { await tx.insert(productImages).values({ productId, url: image.url, alt: image.alt || input.title, sortOrder: next, isPrimary: false }); next += 1; }
    const all = await tx.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(productImages.sortOrder);
    await tx.update(productImages).set({ isPrimary: false }).where(eq(productImages.productId, productId));
    if (all[0]) await tx.update(productImages).set({ isPrimary: true }).where(eq(productImages.id, all[0].id));
    await tx.delete(productAttributes).where(eq(productAttributes.productId, productId));
    const specs = parseSpecs(input.specs);
    if (specs.length) await tx.insert(productAttributes).values(specs.map((spec, index) => ({ productId: productId!, name: spec.name, value: spec.value, sortOrder: index })));
    return productId;
  });
}

export async function deleteProduct(id: string) {
  const [row] = await getDb().select({ slug: products.slug }).from(products).where(and(eq(products.id, id), isNull(products.deletedAt))).limit(1);
  if (!row) return;
  // Suppression logique : les commandes passées gardent leur historique ; l'adresse du produit est libérée.
  await getDb().update(products).set({ deletedAt: new Date(), status: "archived", slug: `${row.slug}-supprime-${Date.now()}`.slice(0, 210), updatedAt: new Date() }).where(eq(products.id, id));
}
