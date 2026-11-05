/**
 * Service client (étape 8) : tickets ouverts par les clients (espace client, formulaire de contact)
 * ou par l'équipe (téléphone, WhatsApp), conversation avec notes internes, assignation, priorités,
 * délai de première réponse, modèles de réponse, satisfaction et clôture automatique.
 *
 * Statuts : open (à traiter par l'équipe) → awaiting_customer (l'équipe a répondu) → resolved →
 * closed. Une réponse du client rouvre le ticket ; un ticket clôturé ne se rouvre plus.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import {
  DEFAULT_SHOP_ID, customers, employees, formSubmissions, forms, orders, supportReplyTemplates, supportTicketMessages, supportTickets, users,
} from "@/lib/db/schema";
import { assertPermission } from "@/server/core/auth/principal";
import { recordAudit } from "@/server/core/audit";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { emitEvent } from "@/server/core/events";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { getSetting } from "@/server/core/settings";
import type { Context } from "@/server/modules/catalog/shared";

export const TICKET_STATUSES = ["open", "awaiting_customer", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TICKET_CATEGORIES = ["order", "payment", "delivery", "product", "return", "account", "seller", "other"] as const;
export const TICKET_CHANNELS = ["web", "form", "email", "phone", "whatsapp", "admin"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const STATUS_LABELS: Record<TicketStatus, string> = { open: "À traiter", awaiting_customer: "En attente du client", resolved: "Résolu", closed: "Clôturé" };

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Référence lisible et non devinable : TCK-AAMMJJ-XXXXXX. */
export function newTicketReference(now = new Date()): string {
  const day = now.toISOString().slice(2, 10).replace(/-/g, "");
  const suffix = Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("");
  return `TCK-${day}-${suffix}`;
}

type TicketRow = typeof supportTickets.$inferSelect;
type MessageRow = typeof supportTicketMessages.$inferSelect;
export type TicketAuthor = { type: "customer"; userId: string | null } | { type: "employee"; employeeId: string | null } | { type: "system" };

const ticketView = (ticket: TicketRow) => ({
  id: ticket.id, reference: ticket.reference, subject: ticket.subject, category: ticket.category, status: ticket.status, statusLabel: STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status,
  priority: ticket.priority, channel: ticket.channel, email: ticket.email, name: ticket.name, userId: ticket.userId, customerId: ticket.customerId,
  assignedEmployeeId: ticket.assignedEmployeeId, orderId: ticket.orderId, productId: ticket.productId, tags: ticket.tags,
  firstResponseDueAt: ticket.firstResponseDueAt, firstResponseAt: ticket.firstResponseAt,
  overdue: !ticket.firstResponseAt && ticket.status === "open" && Boolean(ticket.firstResponseDueAt && ticket.firstResponseDueAt.getTime() < Date.now()),
  lastMessageAt: ticket.lastMessageAt, lastCustomerMessageAt: ticket.lastCustomerMessageAt, resolvedAt: ticket.resolvedAt, closedAt: ticket.closedAt,
  satisfactionScore: ticket.satisfactionScore, satisfactionComment: ticket.satisfactionComment, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, version: ticket.version,
});

const messageView = (message: MessageRow) => ({
  id: message.id, authorType: message.authorType, employeeId: message.employeeId, userId: message.userId, body: message.body, isInternal: message.isInternal,
  fromAssistant: Boolean(message.aiProposalId), createdAt: message.createdAt,
});

/* ─────────────────────────────  Création  ───────────────────────────── */

export type CreateTicketInput = {
  shopId: string; email: string; name?: string; subject: string; message: string; category?: string; priority?: string; channel: (typeof TICKET_CHANNELS)[number];
  userId?: string | null; orderId?: string | null; productId?: string | null; formSubmissionId?: string | null; assignedEmployeeId?: string | null;
};

export async function createTicket(database: Db, input: CreateTicketInput, author: TicketAuthor, context?: Context) {
  if (input.formSubmissionId) {
    const [existing] = await database.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.formSubmissionId, input.formSubmissionId)).limit(1);
    if (existing) return existing.id;
  }
  return database.transaction(async (tx) => {
    const now = new Date();
    const hours = await getSetting(tx as unknown as Db, input.shopId, "support.first_response_hours");
    const customer = input.userId ? (await tx.select({ id: customers.id }).from(customers).where(eq(customers.userId, input.userId)).limit(1))[0] : undefined;
    let ticket: TicketRow | undefined;
    for (let attempt = 0; attempt < 5 && !ticket; attempt += 1) {
      [ticket] = await tx.insert(supportTickets).values({
        shopId: input.shopId, reference: newTicketReference(now), email: input.email.trim().toLowerCase(), name: input.name?.trim() ?? "", subject: input.subject.trim(),
        category: input.category ?? "other", priority: input.priority ?? "normal", channel: input.channel, userId: input.userId ?? null, customerId: customer?.id ?? null,
        orderId: input.orderId ?? null, productId: input.productId ?? null, formSubmissionId: input.formSubmissionId ?? null, assignedEmployeeId: input.assignedEmployeeId ?? null,
        firstResponseDueAt: new Date(now.getTime() + hours * 3_600_000), lastMessageAt: now, lastCustomerMessageAt: author.type === "customer" ? now : null,
      }).onConflictDoNothing({ target: supportTickets.reference }).returning();
    }
    if (!ticket) throw new Error("Impossible d'attribuer une référence de ticket.");
    await tx.insert(supportTicketMessages).values({
      ticketId: ticket.id, authorType: author.type, userId: author.type === "customer" ? author.userId : null, employeeId: author.type === "employee" ? author.employeeId : null, body: input.message.trim(),
    });
    await emitEvent(tx, "support.ticket_created", { ticketId: ticket.id, reference: ticket.reference, channel: ticket.channel }, { aggregateId: ticket.id, shopId: input.shopId });
    if (context) await recordAudit(tx, { action: "support.ticket_created", entityType: "support_ticket", entityId: ticket.id, after: ticketView(ticket), actor: context.actor, meta: context.meta });
    return ticket.id;
  });
}

/** Formulaire de contact : un ticket par message (idempotent : jamais deux tickets pour un envoi). */
export async function createTicketFromSubmission(database: Db, submissionId: string) {
  const [row] = await database.select({ submission: formSubmissions, form: forms }).from(formSubmissions).innerJoin(forms, eq(forms.id, formSubmissions.formId)).where(eq(formSubmissions.id, submissionId)).limit(1);
  if (!row || row.form.code !== "contact") return null;
  const data = row.submission.data as Record<string, unknown>;
  const email = String(data.email ?? row.submission.email ?? "").trim();
  if (!email.includes("@")) return null;
  const subjectLabel = String(data.subject ?? "").trim();
  const reference = String(data.orderReference ?? "").trim();
  const [order] = reference ? await database.select({ id: orders.id }).from(orders).where(eq(orders.reference, reference)).limit(1) : [];
  const category = { Commande: "order", Paiement: "payment", Livraison: "delivery", "Devenir vendeur": "seller" }[subjectLabel] ?? "other";
  // Les formulaires appartiennent à la boutique principale.
  return createTicket(database, {
    shopId: DEFAULT_SHOP_ID, email, name: String(data.name ?? "").slice(0, 160), subject: (subjectLabel ? `${subjectLabel}${reference ? ` — ${reference}` : ""}` : "Message du formulaire de contact").slice(0, 200),
    message: String(data.message ?? "").slice(0, 8000) || "(message vide)", category, channel: "form", userId: row.submission.userId, orderId: order?.id ?? null, formSubmissionId: row.submission.id,
  }, { type: "customer", userId: row.submission.userId });
}

/* ─────────────────────────────  Espace client  ───────────────────────────── */

/**
 * Accès d'un client à sa demande : connecté (compte propriétaire), ou par le lien reçu par e-mail
 * (clé HMAC de la référence, dérivée du secret serveur ; rien n'est stocké). Un client sans compte
 * (formulaire de contact) suit et complète ainsi sa demande.
 */
export type TicketAccess = { userId?: string | null; key?: string | null };

function accessSecret(): string | null {
  return process.env.SUPPORT_LINK_SECRET || process.env.ADMIN_API_JWT_SECRET || process.env.AUTH_SECRET || null;
}

export function ticketAccessKey(reference: string): string | null {
  const secret = accessSecret();
  return secret ? createHmac("sha256", secret).update(`support-ticket:${reference}`).digest("base64url").slice(0, 32) : null;
}

function validKey(reference: string, key: string | null | undefined): boolean {
  const expected = ticketAccessKey(reference);
  if (!expected || !key || key.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
}

async function customerTicket(executor: Executor, reference: string, access: TicketAccess) {
  const [ticket] = await executor.select().from(supportTickets).where(eq(supportTickets.reference, reference)).limit(1);
  const allowed = ticket && ((access.userId && ticket.userId === access.userId) || validKey(reference, access.key));
  if (!ticket || !allowed) throw errors.notFound("Demande", reference);
  return ticket;
}

export async function listCustomerTickets(database: Db, userId: string) {
  const rows = await database.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.lastMessageAt)).limit(100);
  return rows.map((ticket) => ({ reference: ticket.reference, subject: ticket.subject, category: ticket.category, status: ticket.status, statusLabel: STATUS_LABELS[ticket.status as TicketStatus], lastMessageAt: ticket.lastMessageAt, createdAt: ticket.createdAt }));
}

/** Conversation vue par le client : jamais les notes internes ni l'assignation. */
export async function getCustomerTicket(database: Db, reference: string, access: TicketAccess) {
  const ticket = await customerTicket(database, reference, access);
  const messages = await database.select().from(supportTicketMessages).where(and(eq(supportTicketMessages.ticketId, ticket.id), eq(supportTicketMessages.isInternal, false))).orderBy(asc(supportTicketMessages.createdAt));
  const [order] = ticket.orderId ? await database.select({ reference: orders.reference }).from(orders).where(eq(orders.id, ticket.orderId)).limit(1) : [];
  return {
    reference: ticket.reference, subject: ticket.subject, category: ticket.category, status: ticket.status, statusLabel: STATUS_LABELS[ticket.status as TicketStatus], orderReference: order?.reference ?? null,
    canReply: ticket.status !== "closed", canRate: (ticket.status === "resolved" || ticket.status === "closed") && ticket.satisfactionScore === null,
    satisfactionScore: ticket.satisfactionScore, createdAt: ticket.createdAt,
    messages: messages.map((message) => ({ id: message.id, from: message.authorType === "customer" ? "customer" : "team", body: message.body, createdAt: message.createdAt })),
  };
}

export async function customerReply(database: Db, reference: string, access: TicketAccess, body: string) {
  return database.transaction(async (tx) => {
    const ticket = await customerTicket(tx, reference, access);
    if (ticket.status === "closed") throw errors.rule("Cette demande est clôturée : ouvrez une nouvelle demande.");
    const now = new Date();
    const [message] = await tx.insert(supportTicketMessages).values({ ticketId: ticket.id, authorType: "customer", userId: access.userId ?? ticket.userId, body: body.trim() }).returning();
    await tx.update(supportTickets).set({ status: "open", resolvedAt: null, lastMessageAt: now, lastCustomerMessageAt: now, updatedAt: now, version: sql`${supportTickets.version} + 1` }).where(eq(supportTickets.id, ticket.id));
    await emitEvent(tx, "support.customer_replied", { ticketId: ticket.id, messageId: message.id }, { aggregateId: ticket.id, shopId: ticket.shopId });
    return { id: message.id, from: "customer", body: message.body, createdAt: message.createdAt };
  });
}

export async function rateTicket(database: Db, reference: string, access: TicketAccess, input: { score: number; comment?: string }) {
  const ticket = await customerTicket(database, reference, access);
  if (ticket.status !== "resolved" && ticket.status !== "closed") throw errors.rule("La demande doit être résolue pour être évaluée.");
  if (ticket.satisfactionScore !== null) throw errors.conflict("Cette demande a déjà été évaluée.");
  await database.update(supportTickets).set({ satisfactionScore: input.score, satisfactionComment: input.comment?.trim() || null, updatedAt: new Date() }).where(eq(supportTickets.id, ticket.id));
  return { reference, satisfactionScore: input.score };
}

/* ─────────────────────────────  Administration  ───────────────────────────── */

export const ticketListSpec: ListSpec = {
  sortable: { lastMessageAt: supportTickets.lastMessageAt, createdAt: supportTickets.createdAt, firstResponseDueAt: supportTickets.firstResponseDueAt, status: supportTickets.status },
  defaultSort: "-lastMessageAt",
  filterable: {
    status: { column: supportTickets.status, type: "enum", values: TICKET_STATUSES },
    priority: { column: supportTickets.priority, type: "enum", values: TICKET_PRIORITIES },
    category: { column: supportTickets.category, type: "enum", values: TICKET_CATEGORIES },
    channel: { column: supportTickets.channel, type: "enum", values: TICKET_CHANNELS },
    assignedEmployeeId: { column: supportTickets.assignedEmployeeId, type: "uuid" },
    orderId: { column: supportTickets.orderId, type: "uuid" },
    createdAt: { column: supportTickets.createdAt, type: "date" },
  },
  searchable: [supportTickets.reference, supportTickets.subject, supportTickets.email, supportTickets.name],
};

export async function listTickets(database: Db, query: ListQuery, shopId: string, extra: { overdue?: boolean; mine?: string | null } = {}) {
  const conditions: SQL[] = [eq(supportTickets.shopId, shopId)];
  if (extra.overdue) conditions.push(sql`${supportTickets.status} = 'open' and ${supportTickets.firstResponseAt} is null and ${supportTickets.firstResponseDueAt} < now()`);
  if (extra.mine) conditions.push(eq(supportTickets.assignedEmployeeId, extra.mine));
  const where = buildWhere(query, ticketListSpec, conditions);
  const [rows, [total]] = await Promise.all([
    database.select().from(supportTickets).where(where).orderBy(...buildOrderBy(query, ticketListSpec)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(supportTickets).where(where),
  ]);
  return { data: rows.map(ticketView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

async function adminTicket(executor: Executor, id: string, shopId: string, lock = false) {
  const query = executor.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.shopId, shopId))).limit(1);
  const [ticket] = lock ? await query.for("update") : await query;
  if (!ticket) throw errors.notFound("Ticket", id);
  return ticket;
}

/** Fiche complète : conversation (notes internes comprises), client et ses dernières commandes. */
export async function getTicket(database: Db, id: string, shopId: string) {
  const ticket = await adminTicket(database, id, shopId);
  const [messages, user, assignee, recentOrders] = await Promise.all([
    database.select().from(supportTicketMessages).where(eq(supportTicketMessages.ticketId, id)).orderBy(asc(supportTicketMessages.createdAt)),
    ticket.userId ? database.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, createdAt: users.createdAt }).from(users).where(eq(users.id, ticket.userId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    ticket.assignedEmployeeId ? database.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, ticket.assignedEmployeeId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    ticket.userId ? database.select({ id: orders.id, reference: orders.reference, status: orders.status, totalXof: orders.totalXof, createdAt: orders.createdAt }).from(orders).where(eq(orders.buyerId, ticket.userId)).orderBy(desc(orders.createdAt)).limit(5) : Promise.resolve([]),
  ]);
  const authorIds = [...new Set(messages.map((message) => message.employeeId).filter((value): value is string => Boolean(value)))];
  const authors = authorIds.length ? await database.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(inArray(employees.id, authorIds)) : [];
  const authorName = new Map(authors.map((author) => [author.id, `${author.firstName} ${author.lastName}`.trim()]));
  return {
    ...ticketView(ticket),
    assignee: assignee ? { id: assignee.id, name: `${assignee.firstName} ${assignee.lastName}`.trim() } : null,
    customer: user ? { ...user, recentOrders } : null,
    messages: messages.map((message) => ({ ...messageView(message), employeeName: message.employeeId ? authorName.get(message.employeeId) ?? null : null })),
  };
}

export async function createTicketByEmployee(database: Db, input: Omit<CreateTicketInput, "shopId"> & { userId?: string | null }, context: Context) {
  const id = await createTicket(database, { ...input, shopId: context.actor.shopId }, { type: "employee", employeeId: context.actor.employeeId }, context);
  return getTicket(database, id, context.actor.shopId);
}

export type TicketUpdate = { status?: TicketStatus; priority?: string; category?: string; tags?: string[]; assignedEmployeeId?: string | null; version?: number };

export async function updateTicket(database: Db, id: string, input: TicketUpdate, context: Context) {
  if (input.assignedEmployeeId !== undefined) assertPermission(context.actor, "support.assign");
  await database.transaction(async (tx) => {
    const before = await adminTicket(tx, id, context.actor.shopId, true);
    if (input.version !== undefined && input.version !== before.version) throw errors.conflict("Le ticket a été modifié entre-temps : rechargez-le.", { currentVersion: before.version });
    if (input.assignedEmployeeId) {
      const [assignee] = await tx.select({ id: employees.id, status: employees.status }).from(employees).where(and(eq(employees.id, input.assignedEmployeeId), isNull(employees.deletedAt))).limit(1);
      if (!assignee || assignee.status !== "active") throw errors.validation([{ path: "assignedEmployeeId", message: "Employé introuvable ou inactif." }]);
    }
    const now = new Date();
    const values: Partial<typeof supportTickets.$inferInsert> = { updatedAt: now };
    if (input.priority !== undefined) values.priority = input.priority;
    if (input.category !== undefined) values.category = input.category;
    if (input.tags !== undefined) values.tags = [...new Set(input.tags)];
    if (input.assignedEmployeeId !== undefined) values.assignedEmployeeId = input.assignedEmployeeId;
    if (input.status !== undefined && input.status !== before.status) {
      if (before.status === "closed") throw errors.rule("Un ticket clôturé ne change plus de statut.");
      values.status = input.status;
      if (input.status === "resolved") values.resolvedAt = now;
      if (input.status === "closed") values.closedAt = now;
      if (input.status === "open" || input.status === "awaiting_customer") values.resolvedAt = null;
    }
    const [after] = await tx.update(supportTickets).set({ ...values, version: sql`${supportTickets.version} + 1` }).where(eq(supportTickets.id, id)).returning();
    await recordAudit(tx, { action: "support.ticket_updated", entityType: "support_ticket", entityId: id, before: ticketView(before), after: ticketView(after), actor: context.actor, meta: context.meta });
  });
  return getTicket(database, id, context.actor.shopId);
}

export type EmployeeReply = { body: string; internal?: boolean; status?: TicketStatus; templateId?: number; aiProposalId?: string };

/**
 * Réponse de l'équipe. Une réponse visible (pas une note interne) compte comme première réponse,
 * passe le ticket « en attente du client » (sauf statut choisi) et l'assigne à son auteur s'il
 * n'avait personne ; le client est prévenu par e-mail.
 */
export async function employeeReply(database: Db, id: string, input: EmployeeReply, context: Context, executor?: Executor) {
  const work = async (tx: Executor) => {
    const ticket = await adminTicket(tx, id, context.actor.shopId, true);
    if (ticket.status === "closed") throw errors.rule("Ce ticket est clôturé.");
    const now = new Date();
    const [message] = await tx.insert(supportTicketMessages).values({
      ticketId: id, authorType: "employee", employeeId: context.actor.employeeId, body: input.body.trim(), isInternal: Boolean(input.internal), aiProposalId: input.aiProposalId ?? null,
    }).returning();
    const values: Partial<typeof supportTickets.$inferInsert> = { updatedAt: now, lastMessageAt: now };
    if (!input.internal) {
      values.firstResponseAt = ticket.firstResponseAt ?? now;
      const status = input.status ?? "awaiting_customer";
      values.status = status;
      if (status === "resolved") values.resolvedAt = now;
      if (status === "closed") values.closedAt = now;
      if (!ticket.assignedEmployeeId && context.actor.employeeId) values.assignedEmployeeId = context.actor.employeeId;
    } else if (input.status && input.status !== ticket.status) {
      values.status = input.status;
      if (input.status === "resolved") values.resolvedAt = now;
      if (input.status === "closed") values.closedAt = now;
    }
    await tx.update(supportTickets).set({ ...values, version: sql`${supportTickets.version} + 1` }).where(eq(supportTickets.id, id));
    if (input.templateId) await tx.update(supportReplyTemplates).set({ usageCount: sql`${supportReplyTemplates.usageCount} + 1` }).where(eq(supportReplyTemplates.id, input.templateId));
    if (!input.internal) await emitEvent(tx, "support.agent_replied", { ticketId: id, messageId: message.id }, { aggregateId: id, shopId: ticket.shopId });
    await recordAudit(tx, { action: input.internal ? "support.note_added" : "support.reply_sent", entityType: "support_ticket", entityId: id, details: { messageId: message.id, status: values.status ?? ticket.status, aiProposalId: input.aiProposalId ?? null }, actor: context.actor, meta: context.meta });
    return messageView(message);
  };
  return executor ? work(executor) : database.transaction(work);
}

/* ─────────────────────────────  Modèles de réponse  ───────────────────────────── */

type TemplateRow = typeof supportReplyTemplates.$inferSelect;
const templateView = (row: TemplateRow) => ({ id: row.id, code: row.code, title: row.title, body: row.body, category: row.category, isActive: row.isActive, position: row.position, usageCount: row.usageCount, updatedAt: row.updatedAt });

export async function listReplyTemplates(database: Db, shopId: string, options: { activeOnly?: boolean } = {}) {
  const rows = await database.select().from(supportReplyTemplates)
    .where(and(eq(supportReplyTemplates.shopId, shopId), options.activeOnly ? eq(supportReplyTemplates.isActive, true) : undefined))
    .orderBy(asc(supportReplyTemplates.position), asc(supportReplyTemplates.title));
  return rows.map(templateView);
}

export type TemplateInput = { code?: string; title?: string; body?: string; category?: string | null; isActive?: boolean; position?: number };

export async function createReplyTemplate(database: Db, input: TemplateInput & { code: string; title: string; body: string }, context: Context) {
  const [row] = await database.insert(supportReplyTemplates).values({ shopId: context.actor.shopId, code: input.code, title: input.title, body: input.body, category: input.category ?? null, isActive: input.isActive ?? true, position: input.position ?? 0 })
    .onConflictDoNothing().returning();
  if (!row) throw errors.conflict(`Un modèle porte déjà le code « ${input.code} ».`);
  await recordAudit(database, { action: "support.template_created", entityType: "support_template", entityId: String(row.id), after: templateView(row), actor: context.actor, meta: context.meta });
  return templateView(row);
}

export async function updateReplyTemplate(database: Db, id: number, input: TemplateInput, context: Context) {
  const [before] = await database.select().from(supportReplyTemplates).where(and(eq(supportReplyTemplates.id, id), eq(supportReplyTemplates.shopId, context.actor.shopId))).limit(1);
  if (!before) throw errors.notFound("Modèle de réponse", id);
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const [after] = await database.update(supportReplyTemplates).set({ ...values, updatedAt: new Date() }).where(eq(supportReplyTemplates.id, id)).returning();
  await recordAudit(database, { action: "support.template_updated", entityType: "support_template", entityId: String(id), before: templateView(before), after: templateView(after), actor: context.actor, meta: context.meta });
  return templateView(after);
}

export async function deleteReplyTemplate(database: Db, id: number, context: Context) {
  const [row] = await database.delete(supportReplyTemplates).where(and(eq(supportReplyTemplates.id, id), eq(supportReplyTemplates.shopId, context.actor.shopId))).returning();
  if (!row) throw errors.notFound("Modèle de réponse", id);
  await recordAudit(database, { action: "support.template_deleted", entityType: "support_template", entityId: String(id), before: templateView(row), actor: context.actor, meta: context.meta });
}

/** Modèle appliqué à un ticket : variables remplacées, texte prêt à être relu puis envoyé. */
export async function renderReplyTemplate(database: Db, templateId: number, ticketId: string, context: Context) {
  const [template] = await database.select().from(supportReplyTemplates).where(and(eq(supportReplyTemplates.id, templateId), eq(supportReplyTemplates.shopId, context.actor.shopId))).limit(1);
  if (!template) throw errors.notFound("Modèle de réponse", templateId);
  const ticket = await adminTicket(database, ticketId, context.actor.shopId);
  const [user] = ticket.userId ? await database.select({ name: users.name }).from(users).where(eq(users.id, ticket.userId)).limit(1) : [];
  const [order] = ticket.orderId ? await database.select({ reference: orders.reference }).from(orders).where(eq(orders.id, ticket.orderId)).limit(1) : [];
  const [agent] = context.actor.employeeId ? await database.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, context.actor.employeeId)).limit(1) : [];
  const variables: Record<string, string> = {
    customerName: ticket.name || user?.name || "cher client", ticketReference: ticket.reference, ticketSubject: ticket.subject, orderReference: order?.reference ?? "",
    agentName: agent ? `${agent.firstName} ${agent.lastName}`.trim() : "L'équipe", storeName: await getSetting(database, context.actor.shopId, "store.name"),
  };
  const body = template.body.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, name: string) => variables[name] ?? match);
  const missing = [...template.body.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map((match) => match[1]).filter((name) => !variables[name]);
  return { templateId, body, missingVariables: [...new Set(missing)] };
}

/* ─────────────────────────────  Pilotage  ───────────────────────────── */

export async function supportOverview(database: Db, shopId: string, employeeId: string | null) {
  const [byStatus, [counts], [timing]] = await Promise.all([
    database.select({ status: supportTickets.status, value: count() }).from(supportTickets).where(eq(supportTickets.shopId, shopId)).groupBy(supportTickets.status),
    database.select({
      unassigned: sql<number>`(count(*) filter (where ${supportTickets.assignedEmployeeId} is null and ${supportTickets.status} in ('open', 'awaiting_customer')))::int`,
      overdue: sql<number>`(count(*) filter (where ${supportTickets.status} = 'open' and ${supportTickets.firstResponseAt} is null and ${supportTickets.firstResponseDueAt} < now()))::int`,
      mine: employeeId ? sql<number>`(count(*) filter (where ${supportTickets.assignedEmployeeId} = ${employeeId} and ${supportTickets.status} = 'open'))::int` : sql<number>`0`,
    }).from(supportTickets).where(eq(supportTickets.shopId, shopId)),
    database.select({
      firstResponseMinutes: sql<number | null>`avg(extract(epoch from (${supportTickets.firstResponseAt} - ${supportTickets.createdAt})) / 60)`,
      satisfaction: sql<number | null>`avg(${supportTickets.satisfactionScore})`,
      rated: sql<number>`(count(${supportTickets.satisfactionScore}))::int`,
    }).from(supportTickets).where(and(eq(supportTickets.shopId, shopId), sql`${supportTickets.createdAt} > now() - interval '30 days'`)),
  ]);
  return {
    byStatus: Object.fromEntries(TICKET_STATUSES.map((status) => [status, Number(byStatus.find((row) => row.status === status)?.value ?? 0)])),
    unassigned: Number(counts?.unassigned ?? 0), overdue: Number(counts?.overdue ?? 0), assignedToMe: Number(counts?.mine ?? 0),
    last30Days: {
      averageFirstResponseMinutes: timing?.firstResponseMinutes == null ? null : Math.round(Number(timing.firstResponseMinutes)),
      averageSatisfaction: timing?.satisfaction == null ? null : Math.round(Number(timing.satisfaction) * 10) / 10, ratedTickets: Number(timing?.rated ?? 0),
    },
  };
}

/** Tâche planifiée : clôture les tickets résolus depuis plus de N jours (paramètre par boutique). */
export async function autoCloseResolvedTickets(database: Db, now = new Date()) {
  const shops = await database.selectDistinct({ shopId: supportTickets.shopId }).from(supportTickets).where(eq(supportTickets.status, "resolved"));
  let closed = 0;
  for (const { shopId } of shops) {
    const days = await getSetting(database, shopId, "support.auto_close_days");
    const rows = await database.update(supportTickets).set({ status: "closed", closedAt: now, updatedAt: now, version: sql`${supportTickets.version} + 1` })
      .where(and(eq(supportTickets.shopId, shopId), eq(supportTickets.status, "resolved"), isNotNull(supportTickets.resolvedAt), lt(supportTickets.resolvedAt, new Date(now.getTime() - days * 86_400_000))))
      .returning({ id: supportTickets.id });
    closed += rows.length;
  }
  return { closed };
}
