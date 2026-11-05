/** Libellés du service client (tickets) et de l'assistant IA, partagés par les écrans. */
export type Ticket = {
  id: string; reference: string; subject: string; category: string; status: string; statusLabel: string; priority: string; channel: string;
  email: string; name: string | null; userId: string | null; assignedEmployeeId: string | null; orderId: string | null; tags: string[];
  firstResponseDueAt: string | null; firstResponseAt: string | null; overdue: boolean; lastMessageAt: string; createdAt: string; version: number;
  satisfactionScore: number | null; satisfactionComment: string | null;
};
export type TicketDetail = Ticket & {
  assignee: { id: string; name: string } | null;
  customer: { id: string; name: string; email: string; phone?: string | null; recentOrders: Array<{ id: string; reference: string | null; status: string; totalXof: number; createdAt: string }> } | null;
  messages: Array<{ id: number; authorType: string; employeeName: string | null; body: string; isInternal: boolean; fromAssistant: boolean; createdAt: string }>;
};
export type ReplyTemplate = { id: number; code: string; title: string; body: string; category: string | null; isActive: boolean; position: number };
export type Proposal = {
  id: string; kind: string; targetType: string; targetId: string; status: string; instructions: string;
  proposal: Record<string, unknown>; model: string; inputTokens: number; outputTokens: number; decisionNote: string | null; expiresAt: string; createdAt: string;
};

export const TICKET_STATUS_LABELS: Record<string, string> = { open: "À traiter", awaiting_customer: "En attente du client", resolved: "Résolu", closed: "Clôturé" };
export const TICKET_PRIORITY_LABELS: Record<string, string> = { low: "Basse", normal: "Normale", high: "Haute", urgent: "Urgente" };
export const TICKET_CATEGORY_LABELS: Record<string, string> = { order: "Commande", payment: "Paiement", delivery: "Livraison", product: "Produit", return: "Retour", account: "Compte", seller: "Vendeur", other: "Autre" };
export const TICKET_CHANNEL_LABELS: Record<string, string> = { web: "Site", form: "Formulaire", email: "E-mail", phone: "Téléphone", whatsapp: "WhatsApp", admin: "Équipe" };
export const PROPOSAL_STATUS_LABELS: Record<string, string> = { pending: "À valider", applied: "Appliquée", rejected: "Refusée", expired: "Expirée", applying: "En cours" };
export const PROPOSAL_KIND_LABELS: Record<string, string> = { product_content: "Fiche produit", support_reply: "Réponse client" };
export const PRODUCT_FIELD_LABELS: Record<string, string> = { title: "Titre", shortDescription: "Résumé", description: "Description", seoTitle: "Titre SEO", seoDescription: "Meta description", tags: "Étiquettes" };
