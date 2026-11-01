import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { products, reviews } from "@/lib/db/schema";

/** Identifiants de produits déjà évalués par un acheteur pour une commande donnée. */
export async function getReviewedProductIds(orderId: string, buyerId: string): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  const rows = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(and(eq(reviews.orderId, orderId), eq(reviews.buyerId, buyerId)));
  return rows.map((row) => row.productId);
}

/** Avis publiés d'un produit identifié par son slug (fiche produit publique). */
export async function getPublishedReviewsForSlug(slug: string) {
  if (!process.env.DATABASE_URL) return [];
  const db = getDb();
  return db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, createdAt: reviews.createdAt })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(and(eq(products.slug, slug), eq(reviews.isPublished, true), eq(reviews.verifiedPurchase, true)))
    .orderBy(desc(reviews.createdAt))
    .limit(10);
}
