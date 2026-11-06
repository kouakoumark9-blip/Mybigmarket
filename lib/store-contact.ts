import "server-only";
import { DEFAULT_SHOP_ID } from "@/lib/db/schema";
import { db } from "@/server/core/db";
import { getSetting } from "@/server/core/settings";

/** Numéro WhatsApp saisi au back-office (Paramètres › Coordonnées), en chiffres seuls ; vide si absent. */
export async function getStoreWhatsapp(): Promise<string> {
  if (!process.env.DATABASE_URL) return "";
  try {
    return String(await getSetting(db(), DEFAULT_SHOP_ID, "store.whatsapp") ?? "").replace(/\D/g, "");
  } catch (error) {
    console.error("[contact] Numéro WhatsApp illisible :", error instanceof Error ? error.message : error);
    return "";
  }
}
