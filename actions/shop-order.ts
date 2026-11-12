"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shopOrders } from "@/lib/db/schema";
import { db as serviceDb } from "@/server/core/db";
import { clientIp } from "@/server/core/http/request-context";
import { enforceRateLimit } from "@/server/core/rate-limit";
import { createShopOrder, normalizePhone, orderSchema, OrderError } from "@/lib/shop/orders";
import { orderAccessKey } from "@/lib/shop/order-access";

export type PlaceOrderState = { error?: string; reference?: string; accessKey?: string };

export async function placeOrderAction(payload: unknown): Promise<PlaceOrderState> {
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les champs du formulaire." };
  try {
    await enforceRateLimit(serviceDb, "shop.order", `ip:${clientIp(await headers()) ?? "unknown"}`);
    const order = await createShopOrder(parsed.data);
    return { reference: order.reference, accessKey: orderAccessKey(order.reference) };
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    if ((error as { code?: string }).code === "RATE_LIMITED") return { error: "Trop de commandes depuis cette connexion. Réessayez dans un moment ou écrivez-nous sur WhatsApp." };
    console.error("[commande] échec :", error instanceof Error ? error.message : error);
    return { error: "La commande n'a pas pu être enregistrée. Réessayez, ou écrivez-nous sur WhatsApp." };
  }
}

/**
 * Suivi de commande : numéro + téléphone saisis dans un formulaire envoyé en POST (le téléphone ne figure jamais dans l'adresse
 * de la page, donc ni dans l'historique du navigateur ni dans les journaux). Si les deux correspondent, on redirige vers un lien
 * signé qui n'affiche que cette commande.
 */
export async function trackOrderAction(formData: FormData): Promise<void> {
  const reference = String(formData.get("numero") ?? "").trim().toUpperCase();
  const phone = normalizePhone(String(formData.get("telephone") ?? ""));
  try {
    await enforceRateLimit(serviceDb, "shop.track", `ip:${clientIp(await headers()) ?? "unknown"}`);
  } catch (error) {
    if ((error as { code?: string }).code === "RATE_LIMITED") redirect("/suivi-commande?erreur=limite");
    throw error;
  }
  if (!/^MBM-\d{6}-[A-Z0-9]{4}$/.test(reference) || !phone || !process.env.DATABASE_URL) redirect("/suivi-commande?erreur=introuvable");
  const [order] = await getDb().select({ id: shopOrders.id }).from(shopOrders).where(and(eq(shopOrders.reference, reference), eq(shopOrders.phone, phone))).limit(1);
  if (!order) redirect("/suivi-commande?erreur=introuvable");
  redirect(`/suivi-commande?numero=${reference}&k=${orderAccessKey(reference)}`);
}
