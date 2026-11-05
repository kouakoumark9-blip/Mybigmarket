/**
 * Communication (étape 6) : notifications aux clients et à l'équipe, par e-mail et WhatsApp.
 *
 * Principe : aucun envoi dans une transaction métier. Les événements (order.created, payment.succeeded…)
 * sont distribués après la réponse ; le module « Notifications clients » met alors les messages en file
 * (une clé d'unicité par événement : jamais deux fois le même message), puis la file est traitée.
 * Sans SMTP ni WhatsApp configurés, les messages attendent en file.
 */
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { emailTriggerForTransition } from "@/lib/order-rules";
import { renderEmail, type EmailVariables } from "@/lib/email-render";
import {
  emailLog, emailQueue, emailTemplates, formSubmissions, forms, orderItems, orders, outboundMessages, paymentIntents, payments, refunds, users, DEFAULT_SHOP_ID,
} from "@/lib/db/schema";
import { PAYMENT_METHOD_INFO, type PaymentMethodCode } from "@/lib/payments/types";
import { BUILT_IN_TEMPLATES, builtInTemplate, formatXof, ordersTableHtml, paymentInstructionsHtml, submissionTableHtml, wrapLayout, type StoreIdentity } from "@/lib/notifications/templates";
import { emailSender, emailTransport, toE164, whatsappTransport } from "@/lib/notifications/transports";
import { destinationCountries } from "@/lib/west-africa";
import type { Db, Executor } from "@/server/core/db";
import type { DomainEvent } from "@/server/core/events";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { getSetting } from "@/server/core/settings";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import type { Context } from "@/server/modules/catalog/shared";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] }).rows ?? []));
const MAX_ATTEMPTS = 3;

export type NotificationConfig = {
  email: { enabled: boolean };
  whatsapp: { enabled: boolean; templates: Record<string, { name: string; language: string; parameters: string[] }> };
  disabled: string[];
  adminAlerts: boolean;
};

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = { email: { enabled: true }, whatsapp: { enabled: false, templates: {} }, disabled: [], adminAlerts: true };

const configOf = (raw: Record<string, unknown>): NotificationConfig => ({
  ...DEFAULT_NOTIFICATION_CONFIG, ...(raw as Partial<NotificationConfig>),
  email: { ...DEFAULT_NOTIFICATION_CONFIG.email, ...((raw.email ?? {}) as object) },
  whatsapp: { ...DEFAULT_NOTIFICATION_CONFIG.whatsapp, ...((raw.whatsapp ?? {}) as object) },
});

/* ─────────────────────────────  Modèles  ───────────────────────────── */

export async function storeIdentity(database: Db): Promise<StoreIdentity> {
  const [name, email, phone, address] = await Promise.all([
    getSetting(database, DEFAULT_SHOP_ID, "store.name"), getSetting(database, DEFAULT_SHOP_ID, "store.email"),
    getSetting(database, DEFAULT_SHOP_ID, "store.phone"), getSetting(database, DEFAULT_SHOP_ID, "store.address"),
  ]);
  return { name, email, phone, address, url: siteUrl() };
}

/** Modèle effectif : celui de la base s'il est publié (statut « active »), sinon le modèle livré. */
export async function resolveTemplate(executor: Executor, code: string, locale = "fr") {
  const rows = await executor.select().from(emailTemplates).where(and(eq(emailTemplates.code, code), inArray(emailTemplates.locale, [...new Set([locale, "fr"])])));
  const custom = rows.find((row) => row.locale === locale && row.status === "active" && row.isActive) ?? rows.find((row) => row.locale === "fr" && row.status === "active" && row.isActive);
  if (custom) return { code, name: custom.name, subject: custom.subject, bodyHtml: custom.bodyHtml, bodyText: custom.bodyText, variables: custom.variables, source: "database" as const, locale: custom.locale };
  const builtIn = builtInTemplate(code);
  if (!builtIn) return null;
  return { code, name: builtIn.name, subject: builtIn.subject, bodyHtml: builtIn.bodyHtml, bodyText: null, variables: builtIn.variables, source: "built_in" as const, locale: "fr" };
}

/** Met un e-mail en file, une seule fois par clé d'unicité. Aucun appel réseau. */
export async function queueTemplateEmail(database: Db, input: { to: string; code: string; variables: EmailVariables; locale?: string; dedupeKey: string; replyTo?: string | null }) {
  const template = await resolveTemplate(database, input.code, input.locale);
  if (!template) return { queued: false as const, reason: "unknown_template" };
  const store = await storeIdentity(database);
  const rendered = renderEmail(template, { storeName: store.name, storeUrl: store.url, ...input.variables });
  const replyTo = input.replyTo ?? ((await getSetting(database, DEFAULT_SHOP_ID, "email.reply_to")) || null);
  const [row] = await database.insert(emailQueue).values({
    toAddress: input.to.slice(0, 190), templateCode: input.code, subject: rendered.subject.slice(0, 240), bodyHtml: wrapLayout(rendered.html, store),
    payload: { text: rendered.text, replyTo, missingVariables: rendered.missingVariables }, dedupeKey: input.dedupeKey.slice(0, 190), locale: input.locale ?? "fr",
  }).onConflictDoNothing().returning({ id: emailQueue.id });
  return row ? { queued: true as const, id: row.id } : { queued: false as const, reason: "duplicate" };
}

const callingCodeFor = (countryCode: string | null | undefined) => destinationCountries.find((country) => country.code === countryCode)?.callingCode ?? "+225";

/** Message WhatsApp en file, si le canal est activé et le modèle Meta associé au code. */
export async function queueWhatsApp(database: Db, config: NotificationConfig, input: { phone: string | null | undefined; countryCode?: string | null; code: string; variables: EmailVariables; dedupeKey: string }) {
  if (!config.whatsapp.enabled) return { queued: false as const, reason: "disabled" };
  const mapping = config.whatsapp.templates[input.code];
  if (!mapping) return { queued: false as const, reason: "no_template" };
  const to = toE164(input.phone, callingCodeFor(input.countryCode));
  if (!to) return { queued: false as const, reason: "no_phone" };
  const builtIn = builtInTemplate(input.code);
  const preview = builtIn?.whatsappText ? renderEmail({ code: input.code, subject: "", bodyHtml: "", bodyText: builtIn.whatsappText }, input.variables).text : "";
  const [row] = await database.insert(outboundMessages).values({
    channel: "whatsapp", toAddress: to, templateCode: input.code, locale: mapping.language, body: preview.slice(0, 2000),
    payload: { templateName: mapping.name, language: mapping.language, parameters: mapping.parameters.map((name) => String(input.variables[name] ?? "")) },
    dedupeKey: `whatsapp:${input.dedupeKey}`.slice(0, 190),
  }).onConflictDoNothing().returning({ id: outboundMessages.id });
  return row ? { queued: true as const, id: row.id } : { queued: false as const, reason: "duplicate" };
}

/* ─────────────────────────────  Traitement des files  ───────────────────────────── */

/**
 * Envoie un lot d'e-mails en attente. `FOR UPDATE SKIP LOCKED` : deux traitements simultanés ne
 * prennent jamais le même e-mail. Échec : nouvel essai 5 minutes plus tard, 3 essais au plus.
 */
export async function processEmailQueue(database: Db, options: { limit?: number } = {}) {
  const transport = emailTransport();
  const sender = emailSender();
  if (!transport || !sender) return { processed: 0, sent: 0, failed: 0, skipped: "no_config" as const };
  const claimed = rowsOf<{ id: string; to_address: string; subject: string; body_html: string; payload: Record<string, unknown> }>(await database.execute(sql`
    with picked as (
      select id from email_queue where status = 'pending' and scheduled_at <= now() order by scheduled_at asc limit ${options.limit ?? 20} for update skip locked
    )
    update email_queue as queue set status = 'sending' from picked where queue.id = picked.id
    returning queue.id, queue.to_address, queue.subject, queue.body_html, queue.payload`));
  let sent = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      await transport.send({ from: sender.name ? `"${sender.name.replace(/"/g, "")}" <${sender.address}>` : sender.address, to: row.to_address, subject: row.subject, html: row.body_html, text: String(row.payload?.text ?? ""), replyTo: typeof row.payload?.replyTo === "string" ? row.payload.replyTo : undefined });
      await database.update(emailQueue).set({ status: "sent", sentAt: new Date(), attempts: sql`${emailQueue.attempts} + 1`, lastError: null }).where(eq(emailQueue.id, row.id));
      await database.insert(emailLog).values({ queueId: row.id, toAddress: row.to_address, subject: row.subject, provider: transport.name, status: "sent" });
      sent++;
    } catch (error) {
      failed++;
      const message = (error instanceof Error ? error.message : "Envoi impossible").slice(0, 500);
      const [current] = await database.select({ attempts: emailQueue.attempts }).from(emailQueue).where(eq(emailQueue.id, row.id)).limit(1);
      const attempts = (current?.attempts ?? 0) + 1;
      await database.update(emailQueue).set({ attempts, status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", lastError: message, scheduledAt: new Date(Date.now() + 5 * 60_000) }).where(eq(emailQueue.id, row.id));
      await database.insert(emailLog).values({ queueId: row.id, toAddress: row.to_address, subject: row.subject, provider: transport.name, status: "failed", error: message });
    }
  }
  return { processed: claimed.length, sent, failed };
}

export async function processOutboundMessages(database: Db, options: { limit?: number } = {}) {
  const transport = whatsappTransport();
  if (!transport) return { processed: 0, sent: 0, failed: 0, skipped: "no_config" as const };
  const claimed = rowsOf<{ id: string; to_address: string; payload: Record<string, unknown> }>(await database.execute(sql`
    with picked as (
      select id from outbound_messages where status = 'pending' and channel = 'whatsapp' and scheduled_at <= now() order by scheduled_at asc limit ${options.limit ?? 20} for update skip locked
    )
    update outbound_messages as message set status = 'sending' from picked where message.id = picked.id
    returning message.id, message.to_address, message.payload`));
  let sent = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      const result = await transport.send({ to: row.to_address, templateName: String(row.payload.templateName), language: String(row.payload.language ?? "fr"), parameters: (row.payload.parameters as string[]) ?? [] });
      await database.update(outboundMessages).set({ status: "sent", sentAt: new Date(), providerMessageId: result.messageId, attempts: sql`${outboundMessages.attempts} + 1`, lastError: null }).where(eq(outboundMessages.id, row.id));
      sent++;
    } catch (error) {
      failed++;
      const [current] = await database.select({ attempts: outboundMessages.attempts }).from(outboundMessages).where(eq(outboundMessages.id, row.id)).limit(1);
      const attempts = (current?.attempts ?? 0) + 1;
      await database.update(outboundMessages).set({ attempts, status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", lastError: (error instanceof Error ? error.message : "Envoi impossible").slice(0, 500), scheduledAt: new Date(Date.now() + 5 * 60_000) }).where(eq(outboundMessages.id, row.id));
    }
  }
  return { processed: claimed.length, sent, failed };
}

export async function processNotificationQueues(database: Db) {
  const [email, whatsapp] = [await processEmailQueue(database, { limit: 50 }), await processOutboundMessages(database, { limit: 50 })];
  return { email, whatsapp };
}

/* ─────────────────────────────  Contexte des commandes  ───────────────────────────── */

const orderUrl = (reference: string | null) => `${siteUrl()}/compte/commandes${reference ? `?commande=${encodeURIComponent(reference)}` : ""}`;
const dateFr = (value: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" }).format(value);

async function buyerOf(executor: Executor, userId: string | null) {
  if (!userId) return null;
  const [buyer] = await executor.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
  return buyer ?? null;
}

async function ordersWithLines(executor: Executor, orderIds: string[]) {
  if (!orderIds.length) return [];
  const [rows, lines] = await Promise.all([
    executor.select().from(orders).where(inArray(orders.id, orderIds)).orderBy(asc(orders.reference)),
    executor.select({ orderId: orderItems.orderId, title: orderItems.productTitle, quantity: orderItems.quantity, totalXof: orderItems.lineTotalXof, unitPriceXof: orderItems.unitPriceXof }).from(orderItems).where(inArray(orderItems.orderId, orderIds)).orderBy(asc(orderItems.id)),
  ]);
  return rows.map((order) => ({ order, lines: lines.filter((line) => line.orderId === order.id).map((line) => ({ title: line.title, quantity: line.quantity, totalXof: line.totalXof || line.unitPriceXof * line.quantity })) }));
}

const phoneOf = (order: typeof orders.$inferSelect, buyerPhone: string | null | undefined) => buyerPhone || ((order.deliveryAddress ?? {}) as Record<string, string>).phone || null;
const countryOf = (order: typeof orders.$inferSelect) => ((order.deliveryAddress ?? {}) as Record<string, string>).countryCode ?? "CI";

type HandlerContext = { db: Db; config: Record<string, unknown> };

async function notify(database: Db, config: NotificationConfig, input: { code: string; to: string | null | undefined; phone?: string | null; countryCode?: string | null; variables: EmailVariables; dedupeKey: string; locale?: string; replyTo?: string | null }) {
  if (config.disabled.includes(input.code)) return;
  if (config.email.enabled && input.to) await queueTemplateEmail(database, { to: input.to, code: input.code, variables: input.variables, locale: input.locale, dedupeKey: input.dedupeKey, replyTo: input.replyTo });
  if (input.phone !== undefined) await queueWhatsApp(database, config, { phone: input.phone, countryCode: input.countryCode, code: input.code, variables: input.variables, dedupeKey: input.dedupeKey });
}

/* ─────────────────────────────  Abonnements aux événements  ───────────────────────────── */

/** Commande passée : un seul récapitulatif par passage en caisse (toutes les commandes des vendeurs). */
async function onOrderCreated(event: DomainEvent<"order.created">, { db: database, config: raw }: HandlerContext) {
  const config = configOf(raw);
  const [order] = await database.select().from(orders).where(eq(orders.id, event.payload.orderId)).limit(1);
  if (!order) return;
  const group = order.checkoutGroupId ? await database.select({ id: orders.id, reference: orders.reference }).from(orders).where(eq(orders.checkoutGroupId, order.checkoutGroupId)).orderBy(asc(orders.reference)) : [{ id: order.id, reference: order.reference }];
  if (group[0]?.id !== order.id) return;
  const detailed = await ordersWithLines(database, group.map((entry) => entry.id));
  const buyer = await buyerOf(database, order.buyerId);
  const [payment] = await database.select({ method: payments.method, intentId: payments.intentId }).from(payments).where(eq(payments.orderId, order.id)).orderBy(desc(payments.createdAt)).limit(1);
  const [intent] = payment?.intentId ? await database.select().from(paymentIntents).where(eq(paymentIntents.id, payment.intentId)).limit(1) : [];
  const method = (intent?.method ?? payment?.method) as PaymentMethodCode | undefined;
  const total = detailed.reduce((sum, entry) => sum + entry.order.totalXof, 0);
  const references = detailed.map((entry) => entry.order.reference).filter(Boolean).join(", ");
  const variables: EmailVariables = {
    customerName: buyer?.name ?? "cher client", customerEmail: buyer?.email ?? "", orderReference: references, orderTotal: formatXof(total),
    paymentMethod: method ? PAYMENT_METHOD_INFO[method]?.label ?? method : "à choisir",
    ordersTable: ordersTableHtml(detailed.map((entry) => ({ reference: entry.order.reference, lines: entry.lines, shippingXof: entry.order.shippingCostXof, totalXof: entry.order.totalXof }))),
    paymentInstructions: paymentInstructionsHtml(intent?.instructions), orderUrl: orderUrl(order.reference), adminUrl: siteUrl(),
  };
  const key = order.checkoutGroupId ?? order.id;
  await notify(database, config, { code: "order_confirmation", to: buyer?.email, phone: phoneOf(order, buyer?.phone), countryCode: countryOf(order), variables, dedupeKey: `order_confirmation:${key}`, locale: order.locale });
  const adminAddress = await getSetting(database, DEFAULT_SHOP_ID, "email.admin_notification_address");
  if (config.adminAlerts && adminAddress) await notify(database, config, { code: "admin_new_order", to: adminAddress, variables, dedupeKey: `admin_new_order:${key}` });
}

async function intentContext(database: Db, intentId: string) {
  const [intent] = await database.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
  if (!intent) return null;
  const linked = await database.select({ orderId: payments.orderId }).from(payments).where(eq(payments.intentId, intentId));
  const detailed = await ordersWithLines(database, linked.map((row) => row.orderId));
  const buyer = await buyerOf(database, intent.userId);
  return { intent, detailed, buyer };
}

async function onPaymentSucceeded(event: DomainEvent<"payment.succeeded">, { db: database, config: raw }: HandlerContext) {
  const config = configOf(raw);
  const context = await intentContext(database, event.payload.intentId);
  if (!context?.detailed.length) return;
  const first = context.detailed[0].order;
  await notify(database, config, {
    code: "payment_confirmed", to: context.buyer?.email, phone: phoneOf(first, context.buyer?.phone), countryCode: countryOf(first), locale: first.locale, dedupeKey: `payment_confirmed:${context.intent.id}`,
    variables: { customerName: context.buyer?.name ?? "cher client", orderReference: context.detailed.map((entry) => entry.order.reference).filter(Boolean).join(", "), orderTotal: formatXof(context.intent.amountXof), paymentMethod: PAYMENT_METHOD_INFO[context.intent.method as PaymentMethodCode]?.label ?? context.intent.method, orderUrl: orderUrl(first.reference) },
  });
}

async function onPaymentFailed(event: DomainEvent<"payment.failed">, { db: database, config: raw }: HandlerContext) {
  const config = configOf(raw);
  const context = await intentContext(database, event.payload.intentId);
  if (!context?.detailed.length) return;
  const first = context.detailed[0].order;
  const deadline = context.detailed.map((entry) => entry.order.paymentExpiresAt).filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0];
  await notify(database, config, {
    code: "payment_failed", to: context.buyer?.email, phone: phoneOf(first, context.buyer?.phone), countryCode: countryOf(first), locale: first.locale, dedupeKey: `payment_failed:${context.intent.id}`,
    variables: { customerName: context.buyer?.name ?? "cher client", orderReference: context.detailed.map((entry) => entry.order.reference).filter(Boolean).join(", "), orderTotal: formatXof(context.intent.amountXof), paymentDeadline: deadline ? dateFr(deadline) : "l'expiration du délai", orderUrl: orderUrl(first.reference) },
  });
}

/** Changement de statut : expédiée, livrée, annulée, remboursée (le paiement a son propre message). */
async function onOrderStatusChanged(event: DomainEvent<"order.status_changed">, { db: database, config: raw }: HandlerContext) {
  const config = configOf(raw);
  const trigger = emailTriggerForTransition(event.payload.from ?? "", event.payload.to);
  if (!trigger) return;
  const [order] = await database.select().from(orders).where(eq(orders.id, event.payload.orderId)).limit(1);
  if (!order) return;
  if (trigger === "payment_confirmed") {
    // Réglée par une intention de paiement : le message part avec payment.succeeded (un seul pour tout le panier).
    const [linked] = await database.select({ intentId: payments.intentId }).from(payments).where(eq(payments.orderId, order.id)).limit(1);
    if (linked?.intentId) return;
  }
  const buyer = await buyerOf(database, order.buyerId);
  const trackingUrl = order.trackingUrl && /^https:\/\//.test(order.trackingUrl) ? order.trackingUrl : null;
  const variables: EmailVariables = {
    customerName: buyer?.name ?? "cher client", orderReference: order.reference ?? "", orderTotal: formatXof(order.totalXof), orderUrl: orderUrl(order.reference),
    paymentMethod: "", trackingNumber: order.trackingNumber ?? "communiqué dès sa remise au transporteur",
    trackingLink: trackingUrl ? `<p><a href="${trackingUrl.replace(/"/g, "%22")}" style="color:#ff8000">Suivre le colis chez le transporteur</a></p>` : "",
    cancelReason: event.payload.from === "awaiting_payment" ? "le paiement n'a pas été reçu dans le délai." : "par notre service client. Contactez-nous pour toute question.",
  };
  await notify(database, config, { code: trigger, to: buyer?.email, phone: phoneOf(order, buyer?.phone), countryCode: countryOf(order), locale: order.locale, variables, dedupeKey: `${trigger}:${order.id}` });
}

async function onRefundCompleted(event: DomainEvent<"refund.completed">, { db: database, config: raw }: HandlerContext) {
  const config = configOf(raw);
  const [row] = await database.select({ refund: refunds, order: orders }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).where(eq(refunds.id, event.payload.refundId)).limit(1);
  if (!row) return;
  const buyer = await buyerOf(database, row.order.buyerId);
  await notify(database, config, {
    code: "refund_completed", to: buyer?.email, phone: phoneOf(row.order, buyer?.phone), countryCode: countryOf(row.order), locale: row.order.locale, dedupeKey: `refund_completed:${row.refund.id}`,
    variables: { customerName: buyer?.name ?? "cher client", orderReference: row.order.reference ?? "", refundAmount: formatXof(row.refund.amountXof), refundReference: row.refund.reference, orderUrl: orderUrl(row.order.reference) },
  });
}

/** Réponse à un formulaire : prévient l'adresse du formulaire, sinon celle des notifications internes. */
async function onFormSubmitted(event: DomainEvent<"form.submitted">, { db: database, config: raw }: HandlerContext) {
  const config = configOf(raw);
  const [row] = await database.select({ submission: formSubmissions, form: forms }).from(formSubmissions).innerJoin(forms, eq(forms.id, formSubmissions.formId)).where(eq(formSubmissions.id, event.payload.submissionId)).limit(1);
  if (!row) return;
  const to = row.form.notifyEmail || (await getSetting(database, DEFAULT_SHOP_ID, "email.admin_notification_address")) || (await getSetting(database, DEFAULT_SHOP_ID, "store.email"));
  if (!to) return;
  const fields = (row.form.fields as Array<{ name: string; label: string }>).map((field) => ({ label: field.label, value: String(row.submission.data[field.name] ?? "") })).filter((field) => field.value);
  await notify(database, config, {
    code: "form_submission", to, replyTo: row.submission.email, dedupeKey: `form_submission:${row.submission.id}`,
    variables: { formTitle: row.form.title, senderEmail: row.submission.email ?? "(sans e-mail)", submissionTable: submissionTableHtml(fields), receivedAt: dateFr(row.submission.createdAt) },
  });
}

export const notificationSubscriptions = {
  "order.created": onOrderCreated,
  "payment.succeeded": onPaymentSucceeded,
  "payment.failed": onPaymentFailed,
  "order.status_changed": onOrderStatusChanged,
  "refund.completed": onRefundCompleted,
  "form.submitted": onFormSubmitted,
};

/* ─────────────────────────────  Administration  ───────────────────────────── */

const SAMPLE: EmailVariables = {
  customerName: "Awa Koné", customerEmail: "awa@exemple.ci", orderReference: "CMD-2026-000123", orderTotal: "45 000 FCFA", paymentMethod: "Orange Money",
  orderUrl: `${siteUrl()}/compte/commandes`, adminUrl: siteUrl(), trackingNumber: "LTA-123-456", trackingLink: "", cancelReason: "à votre demande.", refundAmount: "10 000 FCFA",
  refundReference: "RMB-2026-000001", paymentDeadline: "5 novembre 2026 à 18:00", formTitle: "Nous contacter", senderEmail: "awa@exemple.ci", receivedAt: "5 novembre 2026 à 10:00",
  employeeName: "Équipe mybigmarket", sentAt: "5 novembre 2026 à 10:00",
  ordersTable: ordersTableHtml([{ reference: "CMD-2026-000123", lines: [{ title: "Lampe de bureau", quantity: 2, totalXof: 20000 }, { title: "Sac cabas", quantity: 1, totalXof: 15000 }], shippingXof: 10000, totalXof: 45000 }]),
  paymentInstructions: "", submissionTable: submissionTableHtml([{ label: "Message", value: "Bonjour, où en est ma commande ?" }]),
};

export async function listTemplates(database: Db) {
  const rows = await database.select().from(emailTemplates).orderBy(asc(emailTemplates.code), asc(emailTemplates.locale));
  const codes = [...new Set([...BUILT_IN_TEMPLATES.map((template) => template.code), ...rows.map((row) => row.code)])];
  return codes.map((code) => {
    const builtIn = builtInTemplate(code);
    const custom = rows.filter((row) => row.code === code);
    const active = custom.find((row) => row.status === "active" && row.isActive);
    return {
      code, name: active?.name ?? builtIn?.name ?? custom[0]?.name ?? code, audience: builtIn?.audience ?? "customer", source: active ? "database" : builtIn ? "built_in" : "inactive",
      subject: active?.subject ?? builtIn?.subject ?? custom[0]?.subject ?? "", variables: active?.variables?.length ? active.variables : builtIn?.variables ?? [],
      versions: custom.map((row) => ({ locale: row.locale, status: row.status, isActive: row.isActive, updatedAt: row.updatedAt.toISOString() })),
    };
  });
}

export async function getTemplate(database: Db, code: string, locale = "fr") {
  const template = await resolveTemplate(database, code, locale);
  if (!template) throw errors.notFound("Modèle d'e-mail", code);
  return template;
}

export async function saveTemplate(database: Db, code: string, input: { locale?: string; name?: string; subject: string; bodyHtml: string; bodyText?: string | null; status: "draft" | "active" | "archived" }, context: Context) {
  if (!/^[a-z0-9_]{2,60}$/.test(code)) throw errors.validation([{ path: "code", message: "Code de modèle invalide." }]);
  const locale = input.locale ?? "fr";
  const builtIn = builtInTemplate(code);
  const check = renderEmail({ code, subject: input.subject, bodyHtml: input.bodyHtml, bodyText: input.bodyText ?? null }, SAMPLE);
  const variables = [...new Set([...(builtIn?.variables ?? []), ...extractTemplateVariables(input.subject, input.bodyHtml, input.bodyText ?? "")])];
  const values = { code, locale, name: input.name ?? builtIn?.name ?? code, subject: input.subject, bodyHtml: input.bodyHtml, bodyText: input.bodyText ?? null, variables, status: input.status, isActive: input.status === "active", updatedByEmployeeId: context.actor.employeeId, updatedAt: new Date() };
  await database.insert(emailTemplates).values(values).onConflictDoUpdate({ target: [emailTemplates.code, emailTemplates.locale], set: values });
  await recordAudit(database, { action: "email_template.saved", entityType: "email_template", entityId: `${code}:${locale}`, after: { status: input.status, subject: input.subject }, actor: context.actor, meta: context.meta });
  return { ...(await getTemplate(database, code, locale)), unknownVariables: check.missingVariables };
}

function extractTemplateVariables(...parts: string[]) {
  const names = new Set<string>();
  for (const part of parts) for (const match of part.matchAll(/\{\{\{?\s*([a-zA-Z0-9_.]+)\s*\}?\}\}/g)) names.add(match[1]);
  return [...names];
}

export async function deleteTemplateOverride(database: Db, code: string, locale: string, context: Context) {
  const removed = await database.delete(emailTemplates).where(and(eq(emailTemplates.code, code), eq(emailTemplates.locale, locale))).returning({ id: emailTemplates.id });
  if (!removed.length) throw errors.notFound("Modèle personnalisé", `${code}:${locale}`);
  await recordAudit(database, { action: "email_template.reverted", entityType: "email_template", entityId: `${code}:${locale}`, actor: context.actor, meta: context.meta });
  return getTemplate(database, code, locale);
}

/** Aperçu avec des valeurs d'exemple, mis en page comme l'envoi réel. */
export async function previewTemplate(database: Db, code: string, input: { locale?: string; subject?: string; bodyHtml?: string; variables?: Record<string, string> }) {
  const base = await getTemplate(database, code, input.locale);
  const store = await storeIdentity(database);
  const rendered = renderEmail({ code, subject: input.subject ?? base.subject, bodyHtml: input.bodyHtml ?? base.bodyHtml, bodyText: null }, { storeName: store.name, storeUrl: store.url, ...SAMPLE, ...(input.variables ?? {}) });
  return { subject: rendered.subject, html: wrapLayout(rendered.html, store), text: rendered.text, missingVariables: rendered.missingVariables };
}

/** E-mail de test, mis en file puis envoyé aussitôt. */
export async function sendTestEmail(database: Db, input: { to: string }, context: Context) {
  const queued = await queueTemplateEmail(database, { to: input.to, code: "email_test", variables: { employeeName: context.actor.label, sentAt: dateFr(new Date()) }, dedupeKey: `email_test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` });
  const result = await processEmailQueue(database, { limit: 10 });
  return { queued, result };
}

export const emailQueueListSpec: ListSpec = {
  sortable: { createdAt: emailQueue.createdAt, scheduledAt: emailQueue.scheduledAt },
  filterable: { status: { column: emailQueue.status, type: "enum", values: ["pending", "sending", "sent", "failed"] }, templateCode: { column: emailQueue.templateCode, type: "string" }, createdAt: { column: emailQueue.createdAt, type: "date" } },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

export async function listEmailQueue(database: Db, query: ListQuery) {
  const where = buildWhere(query, emailQueueListSpec, []);
  const [rows, [total]] = await Promise.all([
    database.select({ id: emailQueue.id, toAddress: emailQueue.toAddress, templateCode: emailQueue.templateCode, subject: emailQueue.subject, status: emailQueue.status, attempts: emailQueue.attempts, lastError: emailQueue.lastError, scheduledAt: emailQueue.scheduledAt, sentAt: emailQueue.sentAt, createdAt: emailQueue.createdAt })
      .from(emailQueue).where(where).orderBy(...buildOrderBy(query, emailQueueListSpec, emailQueue.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(emailQueue).where(where),
  ]);
  return { data: rows.map((row) => ({ ...row, scheduledAt: row.scheduledAt.toISOString(), sentAt: row.sentAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function retryEmail(database: Db, id: string, context: Context) {
  const [row] = await database.update(emailQueue).set({ status: "pending", attempts: 0, scheduledAt: new Date(), lastError: null }).where(and(eq(emailQueue.id, id), inArray(emailQueue.status, ["failed", "pending"]))).returning({ id: emailQueue.id });
  if (!row) throw errors.rule("Seul un e-mail en échec ou en attente peut être renvoyé.");
  await recordAudit(database, { action: "email.retried", entityType: "email", entityId: id, actor: context.actor, meta: context.meta });
  return { id, status: "pending" };
}

export async function listOutboundMessages(database: Db, query: { status?: string; limit?: number }) {
  return database.select().from(outboundMessages).where(query.status ? eq(outboundMessages.status, query.status) : undefined).orderBy(desc(outboundMessages.createdAt)).limit(query.limit ?? 50);
}
