"use server";

import { adminApi } from "@/lib/admin-api";
import { checkbox, codeFrom, integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/service-client/modeles";

export async function createTemplateAction(form: FormData) {
  await requireEmployee("support.update");
  await runAndRedirect(PATH, "Modèle créé.", () => adminApi("POST", "/admin/support/templates", {
    body: { code: optionalText(form, "code") ?? codeFrom(text(form, "title")), title: text(form, "title"), body: text(form, "body"), category: optionalText(form, "category"), position: integer(form, "position") ?? 0 },
  }));
}

export async function updateTemplateAction(form: FormData) {
  await requireEmployee("support.update");
  await runAndRedirect(PATH, "Modèle enregistré.", () => adminApi("PATCH", `/admin/support/templates/${text(form, "templateId")}`, {
    body: { title: text(form, "title"), body: text(form, "body"), category: optionalText(form, "category"), isActive: checkbox(form, "isActive") },
  }));
}

export async function deleteTemplateAction(form: FormData) {
  await requireEmployee("support.delete");
  await runAndRedirect(PATH, "Modèle supprimé.", () => adminApi("DELETE", `/admin/support/templates/${text(form, "templateId")}`));
}
