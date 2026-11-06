"use server";

import { adminApi } from "@/lib/admin-api";
import { runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

/** Coordonnées publiques de la boutique (pied de page, bouton WhatsApp du site). */
export async function updateStoreContactAction(form: FormData) {
  await requireEmployee("settings.update");
  await runAndRedirect("/parametres", "Coordonnées enregistrées : elles apparaissent sur le site.", () => adminApi("PATCH", "/admin/settings", {
    body: { values: { "store.whatsapp": text(form, "whatsapp"), "store.phone": text(form, "phone"), "store.email": text(form, "email") } },
  }));
}
