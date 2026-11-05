"use server";

import { adminApi } from "@/lib/admin-api";
import { list, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/transport/lots";

export async function createShipmentAction(form: FormData) {
  await requireEmployee("shipping.create");
  const expected = text(form, "expectedArrivalAt");
  await runAndRedirect(PATH, "Lot créé.", () => adminApi("POST", "/admin/shipments", {
    body: {
      batchRef: optionalText(form, "batchRef") ?? undefined, mode: optionalText(form, "mode"), carrierName: optionalText(form, "carrierName"),
      origin: optionalText(form, "origin") ?? undefined, destination: optionalText(form, "destination") ?? undefined,
      trackingNumber: optionalText(form, "trackingNumber"), expectedArrivalAt: expected ? new Date(`${expected}T12:00:00Z`).toISOString() : null,
    },
  }));
}

export async function shipmentStatusAction(form: FormData) {
  await requireEmployee("shipping.update");
  await runAndRedirect(PATH, "Statut du lot mis à jour (commandes du lot notifiées).", () => adminApi("POST", `/admin/shipments/${text(form, "shipmentId")}/status`, { body: { status: text(form, "status"), note: optionalText(form, "note") } }));
}

/** Ajoute des commandes au lot à partir de leurs références (une par ligne ou séparées par des virgules). */
export async function addOrdersAction(form: FormData) {
  await requireEmployee("shipping.update");
  const ids = list(form, "orderIds");
  await runAndRedirect(PATH, "Commandes ajoutées au lot.", () => adminApi("POST", `/admin/shipments/${text(form, "shipmentId")}/orders`, { body: { orderIds: ids } }));
}
