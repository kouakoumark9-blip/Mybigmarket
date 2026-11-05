"use server";

import { adminApi } from "@/lib/admin-api";
import { optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/paiement/remboursements";

export async function completeRefundAction(form: FormData) {
  await requireEmployee("orders.refund");
  await runAndRedirect(PATH, "Remboursement marqué comme versé.", () => adminApi("POST", `/admin/refunds/${text(form, "refundId")}/complete`, { body: { providerReference: optionalText(form, "providerReference"), note: optionalText(form, "note") } }));
}

export async function failRefundAction(form: FormData) {
  await requireEmployee("orders.refund");
  await runAndRedirect(PATH, "Remboursement déclaré en échec.", () => adminApi("POST", `/admin/refunds/${text(form, "refundId")}/fail`, { body: { reason: text(form, "reason") || "Échec signalé par l'équipe" } }));
}
