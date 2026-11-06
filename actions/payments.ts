"use server";

/**
 * Paiement d'une commande en attente depuis l'espace client : nouvelle tentative, avec le même moyen ou
 * un autre. Les règles (moyen ouvert pour le pays, délai, montant) vivent dans le service des paiements.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/types";
import { db as coreDb } from "@/server/core/db";
import { AppError } from "@/server/core/errors";
import { ensureCustomer } from "@/server/modules/checkout/customers";
import { retryPayment } from "@/server/modules/payments/service";

const schema = z.object({ orderId: z.string().uuid(), method: z.enum(PAYMENT_METHOD_CODES) });

export async function payOrderAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/connexion?callbackUrl=/compte/commandes");
  const parsed = schema.safeParse({ orderId: formData.get("orderId"), method: formData.get("method") });
  if (!parsed.success) redirect("/compte/commandes?erreur=" + encodeURIComponent("Choisissez un moyen de paiement."));
  const database = coreDb();
  let target: string;
  try {
    const groups = (await ensureCustomer(database, session.user.id)).groupIds;
    const intent = await retryPayment(database, session.user.id, { orderId: parsed.data.orderId, method: parsed.data.method, customerGroupIds: groups });
    // Page de paiement du prestataire si elle existe ; sinon retour sur le suivi avec le statut du paiement.
    target = intent.checkoutUrl || `/compte/commandes?paiement=${encodeURIComponent(intent.reference)}`;
    if (intent.error) target = `/compte/commandes?paiement=${encodeURIComponent(intent.reference)}&erreur=${encodeURIComponent(intent.error)}`;
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Le paiement n'a pas pu être relancé. Réessayez dans un instant.";
    if (!(error instanceof AppError)) console.error("pay_order_failed", error);
    target = `/compte/commandes?erreur=${encodeURIComponent(message)}`;
  }
  redirect(target);
}
