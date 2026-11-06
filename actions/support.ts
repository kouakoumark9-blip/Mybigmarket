"use server";

/**
 * Demandes au service client depuis la boutique (étape 8) : création depuis l'espace client,
 * réponse et évaluation (compte propriétaire, ou lien signé reçu par e-mail pour un client sans
 * compte). Les règles vivent dans le service, partagé avec l'API.
 */
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db as coreDb } from "@/server/core/db";
import { DEFAULT_SHOP_ID, orders, users } from "@/lib/db/schema";
import { scheduleDispatch } from "@/server/core/events";
import { AppError } from "@/server/core/errors";
import { createTicket, customerReply, getTicket, rateTicket, TICKET_CATEGORIES } from "@/server/modules/support/service";

export type SupportFormState = { error?: string };

const newTicketSchema = z.object({
  subject: z.string().trim().min(3, "Sujet trop court.").max(200),
  category: z.enum(TICKET_CATEGORIES).default("other"),
  message: z.string().trim().min(10, "Décrivez votre demande en quelques mots.").max(8000),
  orderReference: z.string().trim().max(40).optional().transform((value) => value || undefined),
});
const referenceSchema = z.string().regex(/^TCK-\d{6}-[A-Z0-9]{6}$/);
const threadPath = (reference: string, key?: string | null) => `/compte/support/${reference}${key ? `?cle=${encodeURIComponent(key)}` : ""}`;

export async function createSupportTicketAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/connexion?callbackUrl=/compte/support");
  const parsed = newTicketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  const db = coreDb();
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) redirect("/connexion");
  let orderId: string | null = null;
  if (parsed.data.orderReference) {
    const [order] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.reference, parsed.data.orderReference), eq(orders.buyerId, session.user.id))).limit(1);
    if (!order) return { error: "Cette commande n'apparaît pas dans votre compte." };
    orderId = order.id;
  }
  const id = await createTicket(db, {
    shopId: DEFAULT_SHOP_ID, email: user.email, name: user.name, subject: parsed.data.subject, message: parsed.data.message, category: parsed.data.category, channel: "web", userId: session.user.id, orderId,
  }, { type: "customer", userId: session.user.id });
  await scheduleDispatch(() => db);
  const { reference } = await getTicket(db, id, DEFAULT_SHOP_ID);
  redirect(threadPath(reference));
}

export async function replySupportTicketAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const reference = referenceSchema.safeParse(formData.get("reference"));
  const body = z.string().trim().min(2, "Écrivez votre message.").max(8000).safeParse(formData.get("body"));
  if (!reference.success) return { error: "Demande introuvable." };
  if (!body.success) return { error: body.error.issues[0]?.message ?? "Message invalide." };
  const key = typeof formData.get("cle") === "string" ? String(formData.get("cle")) : null;
  const session = await auth();
  const db = coreDb();
  try {
    await customerReply(db, reference.data, { userId: session?.user?.id, key }, body.data);
  } catch (error) {
    return { error: error instanceof AppError ? error.message : "Envoi impossible pour le moment." };
  }
  await scheduleDispatch(() => db);
  redirect(threadPath(reference.data, key));
}

export async function rateSupportTicketAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const reference = referenceSchema.safeParse(formData.get("reference"));
  const score = z.coerce.number().int().min(1).max(5).safeParse(formData.get("score"));
  if (!reference.success || !score.success) return { error: "Choisissez une note de 1 à 5." };
  const key = typeof formData.get("cle") === "string" ? String(formData.get("cle")) : null;
  const comment = String(formData.get("comment") ?? "").slice(0, 1000);
  const session = await auth();
  try {
    await rateTicket(coreDb(), reference.data, { userId: session?.user?.id, key }, { score: score.data, comment });
  } catch (error) {
    return { error: error instanceof AppError ? error.message : "Évaluation impossible pour le moment." };
  }
  redirect(threadPath(reference.data, key));
}

const quoteSchema = z.object({
  product: z.string().trim().min(2, "Indiquez le produit recherché.").max(190),
  quantity: z.coerce.number({ message: "Indiquez une quantité." }).int().min(1, "Indiquez une quantité.").max(1_000_000),
  budget: z.string().trim().max(60).optional().transform((value) => value || undefined),
  destination: z.string().trim().min(2, "Indiquez la ville de livraison.").max(120),
  phone: z.string().trim().min(8, "Indiquez un numéro de téléphone joignable.").max(32),
  details: z.string().trim().max(4000).optional().transform((value) => value || ""),
});

/**
 * Demande de devis (quantités, produit introuvable au catalogue, achat en gros) : elle arrive dans
 * les tickets du service client, catégorie « Produit », où l'équipe répond avec une offre.
 */
export async function createQuoteRequestTicketAction(_previous: SupportFormState, formData: FormData): Promise<SupportFormState> {
  const session = await auth();
  const parsed = quoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire incomplet." };
  if (!session?.user?.id) redirect(`/connexion?callbackUrl=${encodeURIComponent(`/demande-de-devis?produit=${parsed.data.product}`)}`);
  const db = coreDb();
  const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) redirect("/connexion");
  const { product, quantity, budget, destination, phone, details } = parsed.data;
  const message = [
    `Produit : ${product}`,
    `Quantité souhaitée : ${quantity.toLocaleString("fr-FR")}`,
    budget ? `Budget indicatif : ${budget}` : null,
    `Livraison : ${destination}`,
    `Téléphone : ${phone}`,
    details ? `\nPrécisions :\n${details}` : null,
  ].filter(Boolean).join("\n");
  const id = await createTicket(db, {
    shopId: DEFAULT_SHOP_ID, email: user.email, name: user.name, subject: `Demande de devis : ${product}`.slice(0, 200), message, category: "product", channel: "web", userId: session.user.id, orderId: null,
  }, { type: "customer", userId: session.user.id });
  await scheduleDispatch(() => db);
  const { reference } = await getTicket(db, id, DEFAULT_SHOP_ID);
  redirect(threadPath(reference));
}
