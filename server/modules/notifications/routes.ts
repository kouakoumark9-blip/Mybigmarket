import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/notifications/service";

const tags = ["E-mails et notifications"];
const codeParams = z.object({ code: z.string().regex(/^[a-z0-9_]{2,60}$/) });
const localeQuery = z.object({ locale: z.enum(["fr", "en", "pt", "ar"]).optional() }).strict();

export const notificationRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.email_templates.list", method: "GET", path: "/admin/email-templates", surface: "admin", tags, permission: "communication.read",
    summary: "Modèles d'e-mails", description: "Modèles livrés et personnalisés : un modèle publié en base (statut « active ») remplace le modèle livré.",
    handler: ({ db }) => service.listTemplates(db),
  }),
  defineRoute({
    id: "admin.email_templates.get", method: "GET", path: "/admin/email-templates/:code", surface: "admin", tags, permission: "communication.read",
    summary: "Modèle effectif", params: codeParams, query: localeQuery,
    handler: ({ db, params, query }) => service.getTemplate(db, params.code, query.locale),
  }),
  defineRoute({
    id: "admin.email_templates.save", method: "PUT", path: "/admin/email-templates/:code", surface: "admin", tags, permission: "communication.update",
    summary: "Personnaliser un modèle", description: "`{{variable}}` est échappé ; `{{{variable}}}` insère un fragment construit par le serveur. Statut « active » : utilisé pour les envois.",
    params: codeParams,
    body: z.object({ locale: z.enum(["fr", "en", "pt", "ar"]).optional(), name: z.string().trim().min(2).max(160).optional(), subject: z.string().trim().min(2).max(240), bodyHtml: z.string().min(10).max(100_000), bodyText: z.string().max(50_000).nullable().optional(), status: z.enum(["draft", "active", "archived"]) }).strict(),
    handler: (ctx) => service.saveTemplate(ctx.db, ctx.params.code, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.email_templates.revert", method: "DELETE", path: "/admin/email-templates/:code", surface: "admin", tags, permission: "communication.update",
    summary: "Revenir au modèle livré", params: codeParams, query: z.object({ locale: z.enum(["fr", "en", "pt", "ar"]).default("fr") }).strict(),
    handler: (ctx) => service.deleteTemplateOverride(ctx.db, ctx.params.code, ctx.query.locale, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.email_templates.preview", method: "POST", path: "/admin/email-templates/:code/preview", surface: "admin", tags, permission: "communication.read", status: 200,
    summary: "Aperçu avec des valeurs d'exemple", params: codeParams,
    body: z.object({ locale: z.enum(["fr", "en", "pt", "ar"]).optional(), subject: z.string().max(240).optional(), bodyHtml: z.string().max(100_000).optional(), variables: z.record(z.string(), z.string().max(2000)).optional() }).strict(),
    handler: ({ db, params, body }) => service.previewTemplate(db, params.code, body),
  }),
  defineRoute({
    id: "admin.emails.test", method: "POST", path: "/admin/emails/test", surface: "admin", tags, permission: "communication.update", status: 200, rateLimit: "admin.write",
    summary: "Envoyer un e-mail de test", description: "Mis en file puis envoyé aussitôt ; indique si l'envoi SMTP est configuré.",
    body: z.object({ to: z.string().trim().email().max(190) }).strict(),
    handler: (ctx) => service.sendTestEmail(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.emails.queue", method: "GET", path: "/admin/emails", surface: "admin", tags, permission: "communication.read",
    summary: "E-mails en file et envoyés", list: service.emailQueueListSpec,
    handler: ({ db, list }) => service.listEmailQueue(db, list),
  }),
  defineRoute({
    id: "admin.emails.retry", method: "POST", path: "/admin/emails/:id/retry", surface: "admin", tags, permission: "communication.update", status: 200,
    summary: "Renvoyer un e-mail en échec", params: uuidParams,
    handler: (ctx) => service.retryEmail(ctx.db, ctx.params.id, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.notifications.process", method: "POST", path: "/admin/notifications/process", surface: "admin", tags, permission: "communication.update", status: 200,
    summary: "Traiter les files d'envoi maintenant", description: "E-mails et messages WhatsApp en attente.",
    handler: ({ db }) => service.processNotificationQueues(db),
  }),
  defineRoute({
    id: "admin.notifications.whatsapp", method: "GET", path: "/admin/whatsapp-messages", surface: "admin", tags, permission: "communication.read",
    summary: "Messages WhatsApp", query: z.object({ status: z.enum(["pending", "sending", "sent", "failed"]).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).strict(),
    handler: ({ db, query }) => service.listOutboundMessages(db, query),
  }),
];
