"use server";

import { adminApi } from "@/lib/admin-api";
import { optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/contenu/redirections";

export async function createRedirectAction(form: FormData) {
  await requireEmployee("seo.update");
  await runAndRedirect(PATH, "Redirection créée.", () => adminApi("POST", "/admin/redirects", { body: { oldPath: text(form, "oldPath"), newPath: text(form, "newPath"), statusCode: text(form, "statusCode") === "302" ? 302 : 301, note: optionalText(form, "note") ?? undefined } }));
}

export async function deleteRedirectAction(form: FormData) {
  await requireEmployee("seo.update");
  await runAndRedirect(PATH, "Redirection supprimée.", () => adminApi("DELETE", `/admin/redirects/${text(form, "redirectId")}`));
}
