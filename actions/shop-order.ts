"use server";

import { headers } from "next/headers";
import { db as serviceDb } from "@/server/core/db";
import { clientIp } from "@/server/core/http/request-context";
import { enforceRateLimit } from "@/server/core/rate-limit";
import { createShopOrder, orderSchema, OrderError } from "@/lib/shop/orders";

export type PlaceOrderState = { error?: string; reference?: string };

export async function placeOrderAction(payload: unknown): Promise<PlaceOrderState> {
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les champs du formulaire." };
  try {
    await enforceRateLimit(serviceDb, "shop.order", `ip:${clientIp(await headers()) ?? "unknown"}`);
    const order = await createShopOrder(parsed.data);
    return { reference: order.reference };
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    if ((error as { code?: string }).code === "RATE_LIMITED") return { error: "Trop de commandes depuis cette connexion. Réessayez dans un moment ou écrivez-nous sur WhatsApp." };
    console.error("[commande] échec :", error instanceof Error ? error.message : error);
    return { error: "La commande n'a pas pu être enregistrée. Réessayez, ou écrivez-nous sur WhatsApp." };
  }
}
