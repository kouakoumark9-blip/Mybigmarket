"use server";

import { adminApi } from "@/lib/admin-api";
import { runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

export async function runTaskAction(form: FormData) {
  await requireEmployee("system.manage");
  await runAndRedirect("/systeme/taches", "Tâche exécutée.", () => adminApi("POST", `/admin/tasks/${text(form, "code")}/run`));
}

export async function toggleTaskAction(form: FormData) {
  await requireEmployee("system.manage");
  await runAndRedirect("/systeme/taches", "Tâche mise à jour.", () => adminApi("PATCH", `/admin/tasks/${text(form, "code")}`, { body: { isEnabled: text(form, "isEnabled") !== "true" } }));
}
