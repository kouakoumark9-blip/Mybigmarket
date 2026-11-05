"use server";

import { adminApi } from "@/lib/admin-api";
import { integer, optionalText, runAndRedirect, text } from "@/lib/action-redirect";
import { requireEmployee } from "@/lib/permissions";

const LIST = "/service-client/tickets";
const detail = (id: string) => `${LIST}/${id}`;

/** Ticket ouvert par l'équipe pour un client (appel, WhatsApp, e-mail). */
export async function createTicketAction(form: FormData) {
  await requireEmployee("support.create");
  await runAndRedirect(LIST, "Ticket créé.", () => adminApi("POST", "/admin/support/tickets", {
    body: {
      email: text(form, "email"), name: optionalText(form, "name") ?? undefined, subject: text(form, "subject"), message: text(form, "message"),
      category: text(form, "category") || "other", priority: text(form, "priority") || "normal", channel: text(form, "channel") || "phone",
    },
  }), { successPath: (ticket) => detail((ticket as { id: string }).id) });
}

/** Statut, priorité, catégorie, assignation. */
export async function updateTicketAction(form: FormData) {
  await requireEmployee("support.update");
  const id = text(form, "ticketId");
  const assignee = text(form, "assignedEmployeeId");
  await runAndRedirect(detail(id), "Ticket mis à jour.", () => adminApi("PATCH", `/admin/support/tickets/${id}`, {
    body: {
      status: text(form, "status") || undefined, priority: text(form, "priority") || undefined, category: text(form, "category") || undefined,
      ...(form.has("assignedEmployeeId") ? { assignedEmployeeId: assignee || null } : {}),
      version: integer(form, "version"),
    },
  }));
}

/** Réponse au client (e-mail envoyé) ou note interne (jamais visible du client). */
export async function replyTicketAction(form: FormData) {
  await requireEmployee("support.update");
  const id = text(form, "ticketId");
  const internal = text(form, "mode") === "internal";
  await runAndRedirect(detail(id), internal ? "Note interne ajoutée." : "Réponse envoyée au client.", () => adminApi("POST", `/admin/support/tickets/${id}/messages`, {
    body: { body: text(form, "body"), internal, status: internal ? undefined : text(form, "status") || undefined, templateId: integer(form, "templateId") },
  }));
}

/** Prépare un brouillon à partir d'un modèle (variables remplacées) ; rien n'est envoyé. */
export async function useTemplateAction(form: FormData) {
  await requireEmployee("support.read");
  const id = text(form, "ticketId");
  const templateId = text(form, "templateId");
  await runAndRedirect(detail(id), "Modèle inséré dans la réponse : relisez avant d'envoyer.", () => adminApi("POST", `/admin/support/tickets/${id}/templates/${templateId}/render`), {
    successPath: (rendered) => `${detail(id)}?template=${templateId}&draft=${encodeURIComponent(String((rendered as { body?: string })?.body ?? "").slice(0, 6000))}#reponse`,
  });
}

/** Demande un brouillon à l'assistant IA : rien n'est envoyé au client. */
export async function proposeReplyAction(form: FormData) {
  await requireEmployee("ai.use");
  const id = text(form, "ticketId");
  await runAndRedirect(detail(id), "Brouillon de l'assistant prêt : relisez, puis appliquez ou refusez.", () => adminApi("POST", "/admin/ai/proposals/support-reply", {
    body: { ticketId: id, instructions: optionalText(form, "instructions") ?? undefined },
  }), { successPath: (proposal) => `${detail(id)}?proposal=${(proposal as { id: string }).id}#assistant` });
}

/** Envoie la réponse proposée par l'assistant, après relecture et confirmation explicite. */
export async function applyReplyProposalAction(form: FormData) {
  await requireEmployee("support.update");
  const id = text(form, "ticketId");
  const edited = optionalText(form, "reply");
  await runAndRedirect(detail(id), "Réponse de l'assistant envoyée au client.", () => adminApi("POST", `/admin/ai/proposals/${text(form, "proposalId")}/apply`, {
    body: { confirm: true, ...(edited ? { edits: { reply: edited } } : {}) },
  }));
}

export async function rejectProposalFromTicketAction(form: FormData) {
  await requireEmployee("ai.use");
  const id = text(form, "ticketId");
  await runAndRedirect(detail(id), "Proposition refusée.", () => adminApi("POST", `/admin/ai/proposals/${text(form, "proposalId")}/reject`, { body: {} }));
}
