"use server";

import { adminApi } from "@/lib/admin-api";
import { optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/communication/emails";

export async function saveTemplateAction(form: FormData) {
  await requireEmployee("communication.update");
  const code = text(form, "code");
  await runAndRedirect(`${PATH}?modele=${code}`, "Modèle enregistré et activé.", () => adminApi("PUT", `/admin/email-templates/${code}`, {
    body: { subject: text(form, "subject"), bodyHtml: text(form, "bodyHtml"), bodyText: optionalText(form, "bodyText"), status: "active" },
  }));
}

export async function revertTemplateAction(form: FormData) {
  await requireEmployee("communication.update");
  const code = text(form, "code");
  await runAndRedirect(`${PATH}?modele=${code}`, "Modèle d’origine rétabli.", () => adminApi("DELETE", `/admin/email-templates/${code}`));
}

export async function sendTestAction(form: FormData) {
  await requireEmployee("communication.update");
  await runAndRedirect(PATH, "E-mail de test mis en file d’envoi.", () => adminApi("POST", "/admin/emails/test", { body: { to: text(form, "to") } }));
}

export async function retryEmailAction(form: FormData) {
  await requireEmployee("communication.update");
  await runAndRedirect(`${PATH}#file`, "Nouvel essai programmé.", () => adminApi("POST", `/admin/emails/${text(form, "emailId")}/retry`));
}

export async function processQueueAction() {
  await requireEmployee("communication.update");
  await runAndRedirect(`${PATH}#file`, "File d’envoi traitée.", () => adminApi("POST", "/admin/notifications/process"));
}
