"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { conversations, messages, products, sellerProfiles, users } from "@/lib/db/schema";

const productSchema = z.object({ productSlug: z.string().min(1).max(210) });
const messageSchema = z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1, "Écrivez un message.").max(2000, "Le message ne peut pas dépasser 2 000 caractères.") });

export async function startConversationAction(formData: FormData): Promise<void> {
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/messages?erreur=produit");
  if (!process.env.DATABASE_URL) redirect(`/messages?demo=${encodeURIComponent(parsed.data.productSlug)}`);
  const destination = `/produits/${encodeURIComponent(parsed.data.productSlug)}`;
  const session = await auth();
  if (!session?.user?.id) redirect(`/connexion?callbackUrl=${encodeURIComponent(destination)}`);
  if (session.user.role !== "buyer") redirect("/messages?info=acheteur");

  const db = getDb();
  const [listing] = await db.select({ productId: products.id, sellerId: products.sellerId })
    .from(products)
    .innerJoin(sellerProfiles, eq(sellerProfiles.userId, products.sellerId))
    .innerJoin(users, eq(users.id, products.sellerId))
    .where(and(eq(products.slug, parsed.data.productSlug), eq(products.status, "approved"), eq(sellerProfiles.verificationStatus, "approved"), eq(users.status, "active")))
    .limit(1);
  if (!listing || listing.sellerId === session.user.id) redirect("/messages?erreur=produit");

  const match = and(eq(conversations.buyerId, session.user.id), eq(conversations.sellerId, listing.sellerId), eq(conversations.productId, listing.productId));
  const [existing] = await db.select({ id: conversations.id }).from(conversations).where(match).limit(1);
  if (existing) redirect(`/messages/${existing.id}`);
  const [created] = await db.insert(conversations).values({ buyerId: session.user.id, sellerId: listing.sellerId, productId: listing.productId }).onConflictDoNothing({ target: [conversations.buyerId, conversations.sellerId, conversations.productId] }).returning({ id: conversations.id });
  if (created) redirect(`/messages/${created.id}`);
  const [raceWinner] = await db.select({ id: conversations.id }).from(conversations).where(match).limit(1);
  if (raceWinner) redirect(`/messages/${raceWinner.id}`);
  redirect("/messages?erreur=conversation");
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const parsed = messageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const session = await auth();
  if (!session?.user?.id || !process.env.DATABASE_URL) return;
  const db = getDb();
  const [thread] = await db.select({ id: conversations.id, buyerId: conversations.buyerId, sellerId: conversations.sellerId })
    .from(conversations).where(eq(conversations.id, parsed.data.conversationId)).limit(1);
  if (!thread || (thread.buyerId !== session.user.id && thread.sellerId !== session.user.id)) return;
  const now = new Date();
  await db.insert(messages).values({ conversationId: thread.id, senderId: session.user.id, body: parsed.data.body, createdAt: now });
  await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, thread.id));
  revalidatePath("/messages");
  revalidatePath(`/messages/${thread.id}`);
}
