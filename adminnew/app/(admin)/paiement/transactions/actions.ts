"use server";

import { adminApi } from "@/lib/admin-api";
import { integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/paiement/transactions";

/** Virement ou paiement à la livraison reçu : confirmation manuelle (journalisée). */
export async function confirmPaymentAction(form: FormData) {
  await requireEmployee("payments.update");
  await runAndRedirect(PATH, "Paiement confirmé : les commandes passent en « payée ».", () => adminApi("POST", `/admin/payments/${text(form, "reference")}/confirm`, {
    body: { amountXof: integer(form, "amountXof"), providerReference: optionalText(form, "providerReference"), note: optionalText(form, "note") },
  }));
}

/** Interroge le prestataire pour connaître l'état réel du paiement. */
export async function reconcilePaymentAction(form: FormData) {
  await requireEmployee("payments.update");
  await runAndRedirect(PATH, "État vérifié auprès du prestataire.", () => adminApi("POST", `/admin/payments/${text(form, "reference")}/reconcile`));
}

export async function reconcileAllAction() {
  await requireEmployee("payments.update");
  await runAndRedirect(PATH, "Paiements en attente vérifiés auprès des prestataires.", () => adminApi("POST", "/admin/payments/reconcile", { body: { olderThanMinutes: 10 } }));
}

export async function cancelPaymentAction(form: FormData) {
  await requireEmployee("payments.update");
  await runAndRedirect(PATH, "Paiement annulé ; le stock réservé est libéré.", () => adminApi("POST", `/admin/payments/${text(form, "reference")}/cancel`, { body: { reason: text(form, "reason") || "Annulé par l'équipe" } }));
}
