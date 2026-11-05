import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { orders, users } from "@/lib/db/schema";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { actorContext, queryBoolean, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/support/service";

const shopTags = ["Boutique : service client"];
const adminTags = ["Service client"];

const message = z.string().trim().min(2, "Message trop court.").max(8000);
const referenceParams = z.object({ reference: z.string().trim().regex(/^TCK-\d{6}-[A-Z0-9]{6}$/, "Référence de demande invalide.") });
const keyQuery = z.object({ cle: z.string().trim().max(64).optional() }).strict();
const statusEnum = z.enum(service.TICKET_STATUSES);

const createCustomerTicket = z.object({
  subject: z.string().trim().min(3).max(200),
  category: z.enum(service.TICKET_CATEGORIES).default("other"),
  message,
  orderReference: z.string().trim().max(40).optional(),
  /** Sans compte : coordonnées obligatoires. */
  email: z.string().trim().email().max(190).optional(),
  name: z.string().trim().max(160).optional(),
}).strict();

const createAdminTicket = z.object({
  email: z.string().trim().email().max(190),
  name: z.string().trim().max(160).optional(),
  subject: z.string().trim().min(3).max(200),
  message,
  category: z.enum(service.TICKET_CATEGORIES).default("other"),
  priority: z.enum(service.TICKET_PRIORITIES).default("normal"),
  channel: z.enum(["phone", "whatsapp", "email", "admin"]).default("phone"),
  orderId: z.string().uuid().nullable().optional(),
  assignedEmployeeId: z.string().uuid().nullable().optional(),
}).strict();

const updateTicketBody = z.object({
  status: statusEnum.optional(),
  priority: z.enum(service.TICKET_PRIORITIES).optional(),
  category: z.enum(service.TICKET_CATEGORIES).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
  assignedEmployeeId: z.string().uuid().nullable().optional(),
  version: z.number().int().min(0).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version"), "Aucun champ à modifier.");

const replyBody = z.object({
  body: message,
  internal: z.boolean().default(false),
  status: statusEnum.optional(),
  templateId: z.number().int().positive().optional(),
}).strict();

const templateCode = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,59}$/, "Code : lettres minuscules, chiffres et tirets.");
const templateBody = z.object({
  code: templateCode, title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(8000),
  category: z.enum(service.TICKET_CATEGORIES).nullable().optional(), isActive: z.boolean().optional(), position: z.number().int().min(0).max(10_000).optional(),
}).strict();
const templateParams = z.object({ id: z.coerce.number().int().positive() });

export const supportRoutes: AnyRoute[] = [
  /* ─────────────  Boutique  ───────────── */
  defineRoute({
    id: "shop.support.tickets.list", method: "GET", path: "/shop/support/tickets", surface: "shop", auth: "required", tags: shopTags,
    summary: "Mes demandes au service client",
    handler: ({ db, customer }) => service.listCustomerTickets(db, customer!.userId),
  }),
  defineRoute({
    id: "shop.support.tickets.create", method: "POST", path: "/shop/support/tickets", surface: "shop", tags: shopTags, rateLimit: "shop.forms",
    summary: "Ouvrir une demande", description: "Connecté : rattachée au compte (et à la commande indiquée, si elle lui appartient). Sans compte : e-mail et nom obligatoires ; le suivi se fait par le lien reçu par e-mail.",
    body: createCustomerTicket,
    handler: async ({ db, body, customer, shop }) => {
      let email = body.email ?? null;
      let name = body.name ?? "";
      let orderId: string | null = null;
      if (customer) {
        const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, customer.userId)).limit(1);
        email = user?.email ?? email;
        name = name || user?.name || "";
        if (body.orderReference) {
          const [order] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.reference, body.orderReference), eq(orders.buyerId, customer.userId))).limit(1);
          if (!order) throw errors.validation([{ path: "body.orderReference", message: "Commande introuvable dans votre compte." }]);
          orderId = order.id;
        }
      } else if (!email || !name) {
        throw errors.validation([{ path: "body.email", message: "Indiquez votre e-mail et votre nom, ou connectez-vous." }]);
      }
      const id = await service.createTicket(db, {
        shopId: shop.id, email: email!, name, subject: body.subject, message: body.message, category: body.category, channel: "web", userId: customer?.userId ?? null, orderId,
      }, { type: "customer", userId: customer?.userId ?? null });
      const reference = (await service.getTicket(db, id, shop.id)).reference;
      return { reference, status: "open", accessKey: customer ? null : service.ticketAccessKey(reference) };
    },
  }),
  defineRoute({
    id: "shop.support.tickets.get", method: "GET", path: "/shop/support/tickets/:reference", surface: "shop", tags: shopTags,
    summary: "Conversation d'une demande", description: "Accès par le compte propriétaire, ou par la clé `cle` du lien reçu par e-mail. Les notes internes de l'équipe ne sont jamais renvoyées.",
    params: referenceParams, query: keyQuery,
    handler: ({ db, params, query, customer }) => service.getCustomerTicket(db, params.reference, { userId: customer?.userId, key: query.cle }),
  }),
  defineRoute({
    id: "shop.support.tickets.reply", method: "POST", path: "/shop/support/tickets/:reference/messages", surface: "shop", tags: shopTags, rateLimit: "shop.forms",
    summary: "Répondre à une demande (la rouvre si elle était en attente ou résolue)", params: referenceParams, query: keyQuery, body: z.object({ body: message }).strict(),
    handler: ({ db, params, query, body, customer }) => service.customerReply(db, params.reference, { userId: customer?.userId, key: query.cle }, body.body),
  }),
  defineRoute({
    id: "shop.support.tickets.rate", method: "POST", path: "/shop/support/tickets/:reference/rating", surface: "shop", tags: shopTags, status: 200,
    summary: "Évaluer la réponse (1 à 5)", params: referenceParams, query: keyQuery,
    body: z.object({ score: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }).strict(),
    handler: ({ db, params, query, body, customer }) => service.rateTicket(db, params.reference, { userId: customer?.userId, key: query.cle }, body),
  }),

  /* ─────────────  Administration  ───────────── */
  defineRoute({
    id: "admin.support.overview", method: "GET", path: "/admin/support/overview", surface: "admin", tags: adminTags, permission: "support.read",
    summary: "Tableau de bord : tickets par statut, non assignés, en retard, temps de première réponse, satisfaction",
    handler: ({ db, admin }) => service.supportOverview(db, admin.shopId, admin.employeeId),
  }),
  defineRoute({
    id: "admin.support.tickets.list", method: "GET", path: "/admin/support/tickets", surface: "admin", tags: adminTags, permission: "support.read",
    summary: "Tickets (file de traitement)", description: "`overdue=1` : délai de première réponse dépassé. `mine=1` : tickets assignés à moi. Filtres `filter[status]`, `filter[priority]`, `filter[assignedEmployeeId][null]=true` (non assignés)…",
    list: service.ticketListSpec, query: z.object({ overdue: queryBoolean.optional(), mine: queryBoolean.optional() }).passthrough(),
    handler: ({ db, list, query, admin }) => service.listTickets(db, list, admin.shopId, { overdue: query.overdue, mine: query.mine ? admin.employeeId : null }),
  }),
  defineRoute({
    id: "admin.support.tickets.create", method: "POST", path: "/admin/support/tickets", surface: "admin", tags: adminTags, permission: "support.create",
    summary: "Ouvrir un ticket pour un client (téléphone, WhatsApp…)", body: createAdminTicket,
    handler: async (ctx) => {
      const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, ctx.body.email.toLowerCase())).limit(1);
      return service.createTicketByEmployee(ctx.db, { ...ctx.body, userId: user?.id ?? null }, actorContext(ctx));
    },
  }),
  defineRoute({
    id: "admin.support.tickets.get", method: "GET", path: "/admin/support/tickets/:id", surface: "admin", tags: adminTags, permission: "support.read",
    summary: "Fiche du ticket : conversation, notes internes, client et commandes récentes", params: uuidParams,
    handler: ({ db, params, admin }) => service.getTicket(db, params.id, admin.shopId),
  }),
  defineRoute({
    id: "admin.support.tickets.update", method: "PATCH", path: "/admin/support/tickets/:id", surface: "admin", tags: adminTags, permission: "support.update",
    summary: "Statut, priorité, catégorie, étiquettes, assignation (permission support.assign)", params: uuidParams, body: updateTicketBody,
    handler: (ctx) => service.updateTicket(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.support.tickets.reply", method: "POST", path: "/admin/support/tickets/:id/messages", surface: "admin", tags: adminTags, permission: "support.update",
    summary: "Répondre au client ou ajouter une note interne", description: "Une réponse visible est envoyée au client par e-mail et passe le ticket « en attente du client » (sauf `status`).",
    params: uuidParams, body: replyBody,
    handler: (ctx) => service.employeeReply(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.support.templates.list", method: "GET", path: "/admin/support/templates", surface: "admin", tags: adminTags, permission: "support.read",
    summary: "Modèles de réponse", query: z.object({ active: queryBoolean.optional() }).strict(),
    handler: ({ db, query, admin }) => service.listReplyTemplates(db, admin.shopId, { activeOnly: query.active }),
  }),
  defineRoute({
    id: "admin.support.templates.create", method: "POST", path: "/admin/support/templates", surface: "admin", tags: adminTags, permission: "support.update",
    summary: "Créer un modèle de réponse", description: "Variables : {{customerName}}, {{ticketReference}}, {{ticketSubject}}, {{orderReference}}, {{agentName}}, {{storeName}}.", body: templateBody,
    handler: (ctx) => service.createReplyTemplate(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.support.templates.update", method: "PATCH", path: "/admin/support/templates/:id", surface: "admin", tags: adminTags, permission: "support.update",
    summary: "Modifier un modèle de réponse", params: templateParams, body: templateBody.partial().strict().refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier."),
    handler: (ctx) => service.updateReplyTemplate(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.support.templates.delete", method: "DELETE", path: "/admin/support/templates/:id", surface: "admin", tags: adminTags, permission: "support.delete", status: 204,
    summary: "Supprimer un modèle de réponse", params: templateParams,
    handler: async (ctx) => { await service.deleteReplyTemplate(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.support.templates.render", method: "POST", path: "/admin/support/tickets/:id/templates/:templateId/render", surface: "admin", tags: adminTags, permission: "support.read", status: 200,
    summary: "Préparer une réponse à partir d'un modèle (variables remplacées, rien n'est envoyé)",
    params: z.object({ id: z.string().uuid(), templateId: z.coerce.number().int().positive() }),
    handler: (ctx) => service.renderReplyTemplate(ctx.db, ctx.params.templateId, ctx.params.id, actorContext(ctx)),
  }),
];
