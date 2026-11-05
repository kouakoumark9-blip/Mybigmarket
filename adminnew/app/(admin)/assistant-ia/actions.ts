"use server";

import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const PATH = "/assistant-ia";

export type SummaryState = { error?: string; result?: { from: string; to: string; summary: { headline: string; highlights: string[]; concerns: string[]; suggestions: string[] } } };
export type SearchState = { error?: string; result?: { entity: string; explanation: string; apiPath: string; results: Array<Record<string, unknown>>; meta: { total: number } } };

/** Résumé des ventes : lecture seule, rien à confirmer. */
export async function salesSummaryAction(_previous: SummaryState, form: FormData): Promise<SummaryState> {
  await requireEmployee("analytics.read");
  try {
    return { result: await adminApi("POST", "/admin/ai/sales-summary", { body: { from: optionalText(form, "from") ?? undefined, to: optionalText(form, "to") ?? undefined } }) };
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }
}

/** Recherche en langage naturel : lecture seule, avec les droits de l'employé. */
export async function naturalSearchAction(_previous: SearchState, form: FormData): Promise<SearchState> {
  await requireEmployee("ai.use");
  try {
    return { result: await adminApi("POST", "/admin/ai/search", { body: { question: text(form, "question"), limit: 20 } }) };
  } catch (error) {
    return { error: apiErrorMessage(error) };
  }
}

/** Génération en masse : une proposition par produit, rien n'est modifié. */
export async function bulkProposeAction(form: FormData) {
  await requireEmployee("ai.use");
  const productIds = form.getAll("productIds").map(String).filter(Boolean);
  const fields = form.getAll("fields").map(String).filter(Boolean);
  await runAndRedirect(PATH, "Propositions créées : relisez-les ci-dessous avant de les appliquer.", async () => {
    const result = await adminApi<{ created: number; failed: Array<{ message: string }> }>("POST", "/admin/ai/proposals/product-content/bulk", {
      body: { productIds, fields: fields.length ? fields : undefined, instructions: optionalText(form, "instructions") ?? undefined, language: text(form, "language") === "en" ? "en" : "fr" },
    });
    if (!result.created && result.failed.length) throw new Error(result.failed[0].message);
    return result;
  });
}

export async function applyProposalAction(form: FormData) {
  await requireEmployee("ai.use");
  const fields = form.getAll("fields").map(String).filter(Boolean);
  await runAndRedirect(PATH, "Proposition appliquée et journalisée.", () => adminApi("POST", `/admin/ai/proposals/${text(form, "proposalId")}/apply`, {
    body: { confirm: true, ...(fields.length ? { fields } : {}) },
  }));
}

export async function applyAllProposalsAction(form: FormData) {
  await requireEmployee("ai.use");
  const ids = form.getAll("ids").map(String).filter(Boolean);
  await runAndRedirect(PATH, "Propositions validées.", async () => {
    const result = await adminApi<{ applied: number; failed: number; results: Array<{ message?: string }> }>("POST", "/admin/ai/proposals/apply-bulk", { body: { ids, confirm: true } });
    if (!result.applied && result.failed) throw new Error(result.results.find((entry) => entry.message)?.message ?? "Aucune proposition appliquée.");
    return result;
  });
}

export async function rejectProposalAction(form: FormData) {
  await requireEmployee("ai.use");
  await runAndRedirect(PATH, "Proposition refusée.", () => adminApi("POST", `/admin/ai/proposals/${text(form, "proposalId")}/reject`, { body: { note: optionalText(form, "note") ?? undefined } }));
}
