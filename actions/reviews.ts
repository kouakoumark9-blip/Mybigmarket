"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { assertActiveAccount } from "@/lib/access";
import { getDb } from "@/lib/db";
import { orderItems, orders, products, reviews } from "@/lib/db/schema";

export type ReviewFormState = { error?: string; success?: string };

/** Statuts pour lesquels l'acheteur a réellement reçu sa commande. */
const deliveredStatuses = ["delivered", "seller_paid"] as const;

const reviewSchema = z.object({
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choisissez une note de 1 à 5.").max(5, "Choisissez une note de 1 à 5."),
  comment: z.string().trim().max(1500, "Le commentaire ne peut pas dépasser 1 500 caractères.").optional().default(""),
});

/**
 * Avis après achat (étape 13).
 *
 * Un avis n'est accepté que si l'acheteur possède une commande livrée contenant le produit.
 * Il est enregistré avec `verifiedPurchase = true` et `isPublished = false` :
 * la publication passe obligatoirement par la modération employé (adminnew/catalogue/avis).
 */
export async function submitReviewAction(_previous: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const parsed = reviewSchema.safeParse({
    orderId: formData.get("orderId"),
    productId: formData.get("productId"),
    rating: formData.get("rating"),
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez votre avis." };
  if (!process.env.DATABASE_URL) return { error: "La base n’est pas connectée : votre avis n’a pas été enregistré." };

  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous pour déposer un avis." };

  try {
    await assertActiveAccount(session.user.id);
  } catch {
    return { error: "Votre compte ne permet pas de déposer un avis." };
  }

  const db = getDb();
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, parsed.data.orderId), eq(orders.buyerId, session.user.id)))
    .limit(1);
  if (!order) return { error: "Commande introuvable." };
  if (!deliveredStatuses.includes(order.status as (typeof deliveredStatuses)[number])) {
    return { error: "Vous pourrez évaluer ce produit une fois la commande livrée." };
  }

  const [line] = await db
    .select({ productId: orderItems.productId })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, order.id), eq(orderItems.productId, parsed.data.productId)))
    .limit(1);
  if (!line) return { error: "Ce produit ne fait pas partie de cette commande." };

  const [product] = await db
    .select({ id: products.id, supplierId: products.supplierId, allowReviews: products.allowReviews })
    .from(products)
    .where(eq(products.id, parsed.data.productId))
    .limit(1);
  if (!product) return { error: "Produit introuvable." };
  if (!product.allowReviews) return { error: "Les avis sont désactivés pour ce produit." };

  const comment = parsed.data.comment.trim();
  try {
    const [created] = await db
      .insert(reviews)
      .values({
        orderId: order.id,
        productId: product.id,
        buyerId: session.user.id,
        subject: "product",
        supplierId: product.supplierId,
        rating: parsed.data.rating,
        comment: comment || null,
        verifiedPurchase: true,
        isPublished: false,
      })
      .onConflictDoNothing({ target: [reviews.orderId, reviews.productId, reviews.buyerId] })
      .returning({ id: reviews.id });
    if (!created) return { error: "Vous avez déjà déposé un avis sur ce produit pour cette commande." };
  } catch (error) {
    console.error("review_create_failed", error);
    return { error: "Impossible d’enregistrer l’avis pour le moment. Réessayez." };
  }

  revalidatePath(`/compte/commandes/${order.id}`);
  return { success: "Merci ! Votre avis a été transmis à la modération. Il sera publié après vérification." };
}
