"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { assertActiveAccount } from "@/lib/session-account";
import { getDb } from "@/lib/db";
import { conversations, messages, products, quoteRequests, sellerProfiles, users } from "@/lib/db/schema";

export type QuoteActionState = { error?: string; success?: string; requestId?: string; conversationId?: string };
const createSchema = z.object({
  kind: z.enum(["product", "sourcing"]),
  productSlug: z.string().max(210).optional(),
  productTitle: z.string().trim().min(2).max(190),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  destination: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().min(8).max(32),
  message: z.string().trim().max(2000).optional().default(""),
});
const statusSchema = z.object({ requestId: z.string().uuid(), status: z.enum(["in_review", "quoted", "closed"]) });

export async function createQuoteRequestAction(_previous: QuoteActionState, formData: FormData): Promise<QuoteActionState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les renseignements de la demande." };
  if (parsed.data.kind === "product" && !parsed.data.productSlug) return { error: "Produit invalide." };
  if (!process.env.DATABASE_URL) return { error: "La base Neon n’est pas connectée. Cette demande n’a pas été transmise." };
  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous pour envoyer une demande de devis." };
  if (session.user.role !== "buyer") return { error: "Un compte acheteur est nécessaire pour demander un devis." };

  const db = getDb();
  const [buyer] = await db.select({ id: users.id, phone: users.phone, role: users.role, status: users.status })
    .from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!buyer || buyer.status !== "active" || buyer.role !== "buyer") return { error: "Votre compte ne permet pas d’envoyer cette demande." };
  try { await assertActiveAccount(buyer.id, "buyer"); }
  catch { return { error: "Votre compte ne permet pas d’envoyer cette demande." }; }

  let sellerId: string | null = null;
  let productId: string | null = null;
  let productTitle = parsed.data.productTitle;
  let conversationId: string | null = null;
  if (parsed.data.kind === "product") {
    const [listing] = await db.select({ id: products.id, title: products.title, sellerId: products.sellerId, minimumQuantity: products.minimumQuantity })
      .from(products).innerJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId)).innerJoin(users, eq(users.id, products.sellerId))
      .where(and(eq(products.slug, parsed.data.productSlug!), eq(products.status, "approved"), eq(sellerProfiles.verificationStatus, "approved"), eq(users.role, "seller"), eq(users.status, "active"))).limit(1);
    if (!listing) return { error: "Ce produit ou son vendeur n’est plus disponible." };
    if (parsed.data.quantity < listing.minimumQuantity) return { error: `La quantité minimale pour ce produit est de ${listing.minimumQuantity}.` };
    if (listing.sellerId === buyer.id) return { error: "Vous ne pouvez pas demander un devis pour votre propre produit." };
    sellerId = listing.sellerId;
    productId = listing.id;
    productTitle = listing.title;
  }

  try {
    const created = await db.transaction(async (tx) => {
      if (sellerId && productId) {
        const match = and(eq(conversations.buyerId, buyer.id), eq(conversations.sellerId, sellerId!), eq(conversations.productId, productId!));
        const [existing] = await tx.select({ id: conversations.id }).from(conversations).where(match).limit(1);
        if (existing) conversationId = existing.id;
        else {
          const [thread] = await tx.insert(conversations).values({ buyerId: buyer.id, sellerId, productId }).onConflictDoNothing({ target: [conversations.buyerId, conversations.sellerId, conversations.productId] }).returning({ id: conversations.id });
          if (thread) conversationId = thread.id;
          else {
            const [raceWinner] = await tx.select({ id: conversations.id }).from(conversations).where(match).limit(1);
            conversationId = raceWinner?.id || null;
          }
        }
        if (conversationId) {
          const now = new Date();
          const detail = parsed.data.message ? ` Détails : ${parsed.data.message}` : "";
          await tx.insert(messages).values({ conversationId, senderId: buyer.id, body: `Demande de devis pour ${parsed.data.quantity} unité(s), livraison à ${parsed.data.destination}.${detail}`, createdAt: now });
          await tx.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
        }
      }
      const [request] = await tx.insert(quoteRequests).values({
        buyerId: buyer.id, sellerId, productId, conversationId, kind: parsed.data.kind,
        productTitle, quantity: parsed.data.quantity, destination: parsed.data.destination,
        contactPhone: parsed.data.contactPhone || buyer.phone || "", message: parsed.data.message,
      }).returning({ id: quoteRequests.id });
      return request;
    });
    if (!created) return { error: "La demande n’a pas pu être enregistrée. Réessayez." };
    revalidatePath("/compte/demandes");
    revalidatePath("/vendeur/demandes");
    revalidatePath("/admin");
    if (conversationId) revalidatePath(`/messages/${conversationId}`);
    return { success: "Votre demande a été enregistrée et transmise dans l’application.", requestId: created.id, conversationId: conversationId || undefined };
  } catch (error) {
    console.error("quote_request_create_failed", error);
    return { error: "Impossible d’enregistrer la demande pour le moment. Réessayez." };
  }
}

export async function updateQuoteRequestStatusAction(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !process.env.DATABASE_URL) return;
  const session = await auth();
  if (!session?.user?.id) return;
  const db = getDb();
  const [actor] = await db.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!actor || actor.status !== "active" || !["seller", "admin"].includes(actor.role)) return;
  const [request] = await db.select().from(quoteRequests).where(eq(quoteRequests.id, parsed.data.requestId)).limit(1);
  if (!request || (actor.role === "seller" && request.sellerId !== session.user.id)) return;
  if (request.status === "closed") return;
  await db.update(quoteRequests).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(quoteRequests.id, request.id));
  revalidatePath("/compte/demandes");
  revalidatePath("/vendeur/demandes");
  revalidatePath("/admin");
}
