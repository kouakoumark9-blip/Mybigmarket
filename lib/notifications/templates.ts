/**
 * Modèles de notification livrés (étape 6). Un modèle actif en base (`email_templates`, statut
 * « active ») remplace le modèle livré pour son code et sa langue ; sinon, c'est celui-ci qui sert.
 *
 * Variables : `{{nom}}` est échappé ; `{{{nom}}}` est un fragment HTML construit par le serveur.
 * Charte : texte noir, accent orange #ff6a00, bouton orange à texte blanc.
 */
import { escapeHtml } from "@/lib/email-render";

export type NotificationTemplate = { code: string; name: string; subject: string; bodyHtml: string; variables: string[]; audience: "customer" | "team"; whatsappText?: string };

const button = (label: string, variable = "orderUrl") =>
  `<p style="margin:24px 0"><a href="{{${variable}}}" style="background:#ff6a00;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:6px;display:inline-block">${label}</a></p>`;

/** Texte saisi (message, réponse) en HTML sûr : échappé, retours à la ligne conservés. */
export function plainTextHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export const BUILT_IN_TEMPLATES: NotificationTemplate[] = [
  {
    code: "order_confirmation", name: "Confirmation de commande", audience: "customer",
    subject: "Votre commande {{orderReference}} est enregistrée",
    variables: ["customerName", "orderReference", "orderTotal", "paymentMethod", "ordersTable", "paymentInstructions", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Merci pour votre commande. Voici son récapitulatif :</p>{{{ordersTable}}}<p><strong>Total à régler : {{orderTotal}}</strong> — {{paymentMethod}}</p>{{{paymentInstructions}}}${button("Suivre ma commande")}<p>Une commande est créée par vendeur : chaque vendeur prépare et expédie la sienne.</p>`,
    whatsappText: "Bonjour {{customerName}}, votre commande {{orderReference}} ({{orderTotal}}) est enregistrée. Suivi : {{orderUrl}}",
  },
  {
    code: "payment_confirmed", name: "Paiement confirmé", audience: "customer",
    subject: "Paiement reçu pour {{orderReference}}",
    variables: ["customerName", "orderReference", "orderTotal", "paymentMethod", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Nous avons bien reçu votre paiement de <strong>{{orderTotal}}</strong> ({{paymentMethod}}) pour la commande {{orderReference}}.</p><p>Le montant reste bloqué sous séquestre et n'est versé au vendeur qu'après la livraison.</p>${button("Voir ma commande")}`,
    whatsappText: "Paiement de {{orderTotal}} reçu pour {{orderReference}}. Merci ! Suivi : {{orderUrl}}",
  },
  {
    code: "payment_failed", name: "Paiement non abouti", audience: "customer",
    subject: "Votre paiement pour {{orderReference}} n'a pas abouti",
    variables: ["customerName", "orderReference", "orderTotal", "paymentDeadline", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Le paiement de {{orderTotal}} pour la commande {{orderReference}} n'a pas abouti.</p><p>Votre commande reste réservée jusqu'au <strong>{{paymentDeadline}}</strong> : vous pouvez réessayer, avec le même moyen ou un autre.</p>${button("Réessayer le paiement")}`,
    whatsappText: "Le paiement de {{orderReference}} n'a pas abouti. Réessayez avant le {{paymentDeadline}} : {{orderUrl}}",
  },
  {
    code: "order_shipped", name: "Commande expédiée", audience: "customer",
    subject: "Votre commande {{orderReference}} est en route",
    variables: ["customerName", "orderReference", "trackingNumber", "trackingLink", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Bonne nouvelle : votre commande {{orderReference}} a quitté la Chine.</p><p>Numéro de suivi : <strong>{{trackingNumber}}</strong></p>{{{trackingLink}}}${button("Suivre ma commande")}`,
    whatsappText: "Votre commande {{orderReference}} est en route (suivi {{trackingNumber}}) : {{orderUrl}}",
  },
  {
    code: "order_delivered", name: "Commande livrée", audience: "customer",
    subject: "Votre commande {{orderReference}} est livrée",
    variables: ["customerName", "orderReference", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Votre commande {{orderReference}} a été livrée. Nous espérons qu'elle vous donne entière satisfaction.</p><p>Un souci avec un article ? Vous pouvez demander un retour depuis votre espace client.</p>${button("Voir ma commande")}`,
    whatsappText: "Votre commande {{orderReference}} est livrée. Merci pour votre confiance !",
  },
  {
    code: "order_cancelled", name: "Commande annulée", audience: "customer",
    subject: "Votre commande {{orderReference}} est annulée",
    variables: ["customerName", "orderReference", "cancelReason", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Votre commande {{orderReference}} a été annulée : {{cancelReason}}</p><p>Si un paiement a été encaissé, il vous sera remboursé.</p>${button("Voir ma commande")}`,
  },
  {
    code: "order_refunded", name: "Commande remboursée", audience: "customer",
    subject: "Votre commande {{orderReference}} est remboursée",
    variables: ["customerName", "orderReference", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Votre commande {{orderReference}} est clôturée et remboursée.</p>${button("Voir ma commande")}`,
  },
  {
    code: "refund_completed", name: "Remboursement effectué", audience: "customer",
    subject: "Remboursement de {{refundAmount}} pour {{orderReference}}",
    variables: ["customerName", "orderReference", "refundAmount", "refundReference", "orderUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Nous vous avons remboursé <strong>{{refundAmount}}</strong> pour la commande {{orderReference}} (référence {{refundReference}}).</p><p>Selon votre moyen de paiement, le montant apparaît sous quelques jours.</p>${button("Voir ma commande")}`,
    whatsappText: "Remboursement de {{refundAmount}} effectué pour {{orderReference}}.",
  },
  {
    code: "admin_new_order", name: "Nouvelle commande (équipe)", audience: "team",
    subject: "Nouvelle commande {{orderReference}} — {{orderTotal}}",
    variables: ["orderReference", "orderTotal", "customerName", "customerEmail", "paymentMethod", "ordersTable", "adminUrl"],
    bodyHtml: `<p>Nouvelle commande de {{customerName}} ({{customerEmail}}), {{paymentMethod}}.</p>{{{ordersTable}}}<p><strong>Total : {{orderTotal}}</strong></p>`,
  },
  {
    code: "form_submission", name: "Nouveau message (équipe)", audience: "team",
    subject: "{{formTitle}} : nouveau message de {{senderEmail}}",
    variables: ["formTitle", "senderEmail", "submissionTable", "receivedAt"],
    bodyHtml: `<p>Nouveau message reçu le {{receivedAt}} via le formulaire « {{formTitle}} ».</p>{{{submissionTable}}}<p>Répondez directement à {{senderEmail}}.</p>`,
  },
  {
    code: "support_ticket_received", name: "Demande reçue (service client)", audience: "customer",
    subject: "Votre demande {{ticketReference}} est bien reçue",
    variables: ["customerName", "ticketReference", "ticketSubject", "ticketUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>Nous avons bien reçu votre demande <strong>{{ticketReference}}</strong> : « {{ticketSubject}} ». Notre équipe vous répond dans les meilleurs délais.</p>${button("Suivre ma demande", "ticketUrl")}<p>Pour compléter votre demande, répondez depuis votre espace client.</p>`,
    whatsappText: "Bonjour {{customerName}}, votre demande {{ticketReference}} est bien reçue. Suivi : {{ticketUrl}}",
  },
  {
    code: "support_reply", name: "Réponse du service client", audience: "customer",
    subject: "Réponse à votre demande {{ticketReference}}",
    variables: ["customerName", "ticketReference", "ticketSubject", "replyHtml", "agentName", "ticketUrl"],
    bodyHtml: `<p>Bonjour {{customerName}},</p><p>{{agentName}} a répondu à votre demande <strong>{{ticketReference}}</strong> (« {{ticketSubject}} ») :</p><div style="border-left:3px solid #ff6a00;padding:8px 14px;margin:16px 0;color:#111">{{{replyHtml}}}</div>${button("Voir la conversation", "ticketUrl")}`,
    whatsappText: "Bonjour {{customerName}}, le service client a répondu à votre demande {{ticketReference}} : {{ticketUrl}}",
  },
  {
    code: "support_new_ticket", name: "Nouveau ticket (équipe)", audience: "team",
    subject: "Nouveau ticket {{ticketReference}} : {{ticketSubject}}",
    variables: ["ticketReference", "ticketSubject", "customerEmail", "channel", "messageHtml"],
    bodyHtml: `<p>Nouveau ticket <strong>{{ticketReference}}</strong> de {{customerEmail}} (canal : {{channel}}).</p><div style="border-left:3px solid #ff6a00;padding:8px 14px;margin:16px 0;color:#111">{{{messageHtml}}}</div>`,
  },
  {
    code: "email_test", name: "E-mail de test", audience: "team",
    subject: "Test d'envoi — {{storeName}}",
    variables: ["employeeName", "sentAt", "storeName"],
    bodyHtml: `<p>Bonjour {{employeeName}},</p><p>Cet e-mail de test confirme que l'envoi fonctionne ({{sentAt}}).</p>`,
  },
];

export const builtInTemplate = (code: string) => BUILT_IN_TEMPLATES.find((template) => template.code === code) ?? null;

export type StoreIdentity = { name: string; url: string; email: string; phone: string; address: string };

/** Mise en page commune : en-tête au nom de la boutique, contenu, pied de page avec les coordonnées. */
export function wrapLayout(contentHtml: string, store: StoreIdentity): string {
  const contact = [store.email, store.phone, store.address].filter(Boolean).map(escapeHtml).join(" · ");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`
    + `<body style="margin:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#111111">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">`
    + `<tr><td style="padding:20px 24px;border-bottom:4px solid #ff6a00"><a href="${escapeHtml(store.url)}" style="color:#111111;text-decoration:none;font-size:20px;font-weight:700">${escapeHtml(store.name)}</a></td></tr>`
    + `<tr><td style="padding:24px;font-size:15px;line-height:1.55">${contentHtml}</td></tr>`
    + `<tr><td style="padding:16px 24px;background:#111111;color:#dddddd;font-size:12px;line-height:1.5">${escapeHtml(store.name)}${contact ? `<br>${contact}` : ""}</td></tr>`
    + `</table></td></tr></table></body></html>`;
}

const formatXof = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value).replace(/ | /g, " ")} FCFA`;
export { formatXof };

/** Tableau des commandes d'un passage en caisse (valeurs échappées). */
export function ordersTableHtml(orders: Array<{ reference: string | null; lines: Array<{ title: string; quantity: number; totalXof: number }>; shippingXof: number; totalXof: number }>): string {
  const cell = "padding:6px 8px;border-bottom:1px solid #eeeeee;font-size:14px";
  return orders.map((order) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:collapse">`
    + `<tr><td colspan="3" style="${cell};font-weight:700">Commande ${escapeHtml(order.reference ?? "")}</td></tr>`
    + order.lines.map((line) => `<tr><td style="${cell}">${escapeHtml(line.title)}</td><td style="${cell};text-align:center">× ${line.quantity}</td><td style="${cell};text-align:right">${formatXof(line.totalXof)}</td></tr>`).join("")
    + (order.shippingXof > 0 ? `<tr><td style="${cell}" colspan="2">Transport</td><td style="${cell};text-align:right">${formatXof(order.shippingXof)}</td></tr>` : "")
    + `<tr><td style="${cell};font-weight:700" colspan="2">Total</td><td style="${cell};text-align:right;font-weight:700">${formatXof(order.totalXof)}</td></tr></table>`).join("");
}

/** Consignes de paiement (virement, paiement à la livraison) issues de l'intention de paiement. */
export function paymentInstructionsHtml(instructions: Record<string, unknown> | null | undefined): string {
  if (!instructions || typeof instructions !== "object") return "";
  const value = (key: string) => (instructions[key] === undefined || instructions[key] === null ? "" : escapeHtml(String(instructions[key])));
  if (instructions.kind === "bank_transfer") {
    return `<div style="border:1px solid #ff6a00;border-radius:6px;padding:12px 16px;margin:16px 0"><p style="margin:0 0 8px;font-weight:700">Virement à effectuer</p>`
      + `<p style="margin:0">Bénéficiaire : ${value("accountHolder")}<br>Banque : ${value("bankName")}<br>IBAN / RIB : ${value("iban")}${instructions.bic ? `<br>BIC : ${value("bic")}` : ""}<br>Montant : ${typeof instructions.amountXof === "number" ? formatXof(instructions.amountXof) : ""}<br><strong>Référence à indiquer : ${value("reference")}</strong></p>`
      + (instructions.note ? `<p style="margin:8px 0 0">${value("note")}</p>` : "") + `</div>`;
  }
  if (instructions.kind === "cash_on_delivery") return `<p>${value("note")}</p>`;
  return "";
}

/** Tableau des réponses d'un formulaire (valeurs échappées). */
export function submissionTableHtml(fields: Array<{ label: string; value: string }>): string {
  const cell = "padding:6px 8px;border-bottom:1px solid #eeeeee;font-size:14px;vertical-align:top";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`
    + fields.map((field) => `<tr><td style="${cell};font-weight:700;width:35%">${escapeHtml(field.label)}</td><td style="${cell};white-space:pre-wrap">${escapeHtml(field.value)}</td></tr>`).join("")
    + `</table>`;
}
