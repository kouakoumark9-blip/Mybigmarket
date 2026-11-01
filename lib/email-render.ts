/**
 * Rendu des modèles d'e-mail (module 11).
 *
 * Contraintes :
 *  - aucune dépendance base ni SMTP : le rendu est pur et testable ;
 *  - les variables sont échappées en HTML pour éviter toute injection via un
 *    champ utilisateur (nom de client, motif de retour…) ;
 *  - une variable absente laisse un marqueur visible plutôt qu'un vide silencieux,
 *    pour détecter un modèle incomplet en test.
 */

export type EmailVariables = Record<string, string | number | null | undefined>;

export type EmailTemplate = {
  code: string;
  subject: string;
  /** Peut être absent en base pour un brouillon : le rendu reste tolérant. */
  bodyHtml?: string | null;
  bodyText?: string | null;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
  missingVariables: string[];
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Retire les balises pour la version texte, sans dépendance externe. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VARIABLE_PATTERN)) found.add(match[1]);
  return [...found];
}

type RenderMode = "html" | "text";

function substitute(template: string, variables: EmailVariables, mode: RenderMode, missing: Set<string>): string {
  return template.replace(VARIABLE_PATTERN, (_full, name: string) => {
    const raw = variables[name];
    if (raw === null || raw === undefined || raw === "") {
      missing.add(name);
      return `[${name}]`;
    }
    const text = String(raw);
    return mode === "html" ? escapeHtml(text) : text;
  });
}

export function renderEmail(template: EmailTemplate, variables: EmailVariables): RenderedEmail {
  const missing = new Set<string>();
  const subject = substitute(template.subject ?? "", variables, "html", missing);
  const html = substitute(template.bodyHtml ?? "", variables, "html", missing);
  const text = template.bodyText
    ? substitute(template.bodyText, variables, "text", missing)
    : htmlToText(html);

  return { subject, html, text, missingVariables: [...missing] };
}

/** Modèles livrés par défaut à l'installation (squelette, statut `draft`). */
export const DEFAULT_EMAIL_TEMPLATES: Array<{ code: string; name: string; variables: string[] }> = [
  { code: "order_confirmation", name: "Confirmation de commande", variables: ["customerName", "orderReference", "orderTotal", "orderUrl"] },
  { code: "order_status_update", name: "Changement de statut de commande", variables: ["customerName", "orderReference", "statusLabel", "orderUrl"] },
  // Déclencheurs émis par `emailTriggerForTransition` (module 6) : chaque
  // transition du moteur a son modèle, sinon la notification serait perdue.
  { code: "payment_confirmed", name: "Paiement confirmé sous séquestre", variables: ["customerName", "orderReference", "orderTotal", "orderUrl"] },
  { code: "order_shipped", name: "Commande expédiée", variables: ["customerName", "orderReference", "trackingNumber", "orderUrl"] },
  { code: "order_delivered", name: "Commande livrée", variables: ["customerName", "orderReference", "orderUrl"] },
  { code: "order_cancelled", name: "Commande annulée", variables: ["customerName", "orderReference", "refundDelayDays", "orderUrl"] },
  { code: "order_refunded", name: "Commande remboursée", variables: ["customerName", "orderReference", "refundAmount", "orderUrl"] },
  { code: "invoice_available", name: "Facture disponible", variables: ["customerName", "invoiceNumber", "invoiceTotal", "orderUrl"] },
  { code: "account_created", name: "Nouveau compte client", variables: ["customerName", "loginUrl"] },
  { code: "password_reset", name: "Mot de passe oublié", variables: ["customerName", "resetUrl", "validityMinutes"] },
  { code: "return_status_update", name: "Suivi d'un retour produit", variables: ["customerName", "orderReference", "returnStatus"] },
  { code: "customer_message", name: "Réponse à un message client", variables: ["customerName", "messageBody", "threadUrl"] },
  { code: "email_test", name: "E-mail de test (administration)", variables: ["employeeName", "sentAt"] },
];
