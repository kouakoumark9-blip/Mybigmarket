"use server";

import { AdminApiError, adminApi } from "@/lib/admin-api";
import { optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { textToBlocks, type Block } from "@/lib/cms-text";
import { requireEmployee } from "@/lib/permissions";

function blocksFrom(form: FormData): Block[] {
  let advanced: Block[] = [];
  const raw = text(form, "advanced");
  if (raw) {
    try { advanced = JSON.parse(raw); } catch { throw new AdminApiError(400, "BAD_REQUEST", "Blocs avancés : JSON invalide."); }
    if (!Array.isArray(advanced)) throw new AdminApiError(400, "BAD_REQUEST", "Blocs avancés : une liste est attendue.");
  }
  return [...textToBlocks(text(form, "content")), ...advanced];
}

const pageBody = (form: FormData) => ({
  slug: text(form, "slug"), title: text(form, "title"), excerpt: text(form, "excerpt"), blocks: blocksFrom(form),
  metaTitle: optionalText(form, "metaTitle"), metaDescription: optionalText(form, "metaDescription"), status: text(form, "status") === "published" ? "published" : "draft",
});

export async function createPageAction(form: FormData) {
  await requireEmployee("appearance.create");
  await runAndRedirect("/contenu/pages", "Page créée.", () => adminApi("POST", "/admin/pages", { body: pageBody(form) }), { successPath: (page) => `/contenu/pages/${(page as { id: string }).id}` });
}

export async function updatePageAction(form: FormData) {
  await requireEmployee("appearance.update");
  const id = text(form, "pageId");
  await runAndRedirect(`/contenu/pages/${id}`, "Page enregistrée.", () => adminApi("PATCH", `/admin/pages/${id}`, { body: pageBody(form) }));
}

export async function deletePageAction(form: FormData) {
  await requireEmployee("appearance.delete");
  await runAndRedirect("/contenu/pages", "Page supprimée.", () => adminApi("DELETE", `/admin/pages/${text(form, "pageId")}`));
}
