import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentMethodConfigs } from "@/lib/db/schema";

/**
 * Vrai si au moins un moyen de paiement est activé au back-office. Tant que ce n'est pas le cas,
 * la vitrine n'affiche ni logos de paiement ni promesse « paiement sécurisé » : elle ne promet que
 * ce qu'elle sait faire. Sans base (démonstration locale), le parcours simulé reste affiché.
 */
export async function hasOpenPaymentMethod(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return true;
  try {
    const rows = await getDb().select({ id: paymentMethodConfigs.id }).from(paymentMethodConfigs).where(eq(paymentMethodConfigs.isActive, true)).limit(1);
    return rows.length > 0;
  } catch (error) {
    console.error("[payments] Moyens de paiement illisibles :", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Codes des moyens de paiement activés au back-office (ex. « wave », « card »), pour afficher leurs logos. */
export async function listOpenPaymentMethodCodes(): Promise<string[]> {
  if (!process.env.DATABASE_URL) return ["wave", "orange_money", "mtn_momo", "card"];
  try {
    const rows = await getDb().select({ code: paymentMethodConfigs.code }).from(paymentMethodConfigs).where(eq(paymentMethodConfigs.isActive, true));
    return rows.map((row) => row.code);
  } catch (error) {
    console.error("[payments] Moyens de paiement illisibles :", error instanceof Error ? error.message : error);
    return [];
  }
}
