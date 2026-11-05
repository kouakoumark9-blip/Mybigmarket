"use server";

import { AdminApiError, adminApi } from "@/lib/admin-api";
import { runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/outils/imports";

/** Analyse (simulation) d'un fichier : rien n'est écrit dans le catalogue. */
export async function analyzeImportAction(form: FormData) {
  await requireEmployee("catalog.import");
  const file = form.get("file");
  await runAndRedirect(PATH, "Fichier analysé : vérifiez le résultat de la simulation avant de lancer l’import.", async () => {
    if (!(file instanceof File) || file.size === 0) throw new AdminApiError(400, "BAD_REQUEST", "Choisissez un fichier CSV.");
    if (file.size > 4_000_000) throw new AdminApiError(400, "BAD_REQUEST", "Fichier trop volumineux (4 Mo au plus).");
    return adminApi("POST", "/admin/imports", { body: { entity: text(form, "entity"), csv: await file.text(), fileName: file.name, run: false } });
  });
}

export async function runImportAction(form: FormData) {
  await requireEmployee("catalog.import");
  await runAndRedirect(PATH, "Import lancé : il se poursuit en arrière-plan.", () => adminApi("POST", `/admin/imports/${text(form, "jobId")}/run`));
}

export async function continueImportAction(form: FormData) {
  await requireEmployee("catalog.import");
  await runAndRedirect(PATH, "Lot suivant traité.", () => adminApi("POST", `/admin/imports/${text(form, "jobId")}/process`));
}

export async function cancelImportAction(form: FormData) {
  await requireEmployee("catalog.import");
  await runAndRedirect(PATH, "Import annulé.", () => adminApi("POST", `/admin/imports/${text(form, "jobId")}/cancel`));
}
