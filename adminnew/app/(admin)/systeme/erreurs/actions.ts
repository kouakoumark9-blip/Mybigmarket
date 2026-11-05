"use server";

import { adminApi } from "@/lib/admin-api";
import { runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

export async function resolveErrorGroupAction(form: FormData) {
  await requireEmployee("system.manage");
  await runAndRedirect("/systeme/erreurs", "Erreur marquée comme résolue.", () => adminApi("POST", "/admin/error-logs/resolve", { body: { fingerprint: text(form, "fingerprint") } }));
}
