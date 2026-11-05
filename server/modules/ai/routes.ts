import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/ai/service";

const tags = ["Assistant IA"];
const instructions = z.string().trim().max(1000).optional();

const applyBody = z.object({
  /** Confirmation explicite de l'employé : sans elle, rien n'est appliqué. */
  confirm: z.literal(true, { message: "Confirmez explicitement l'application (confirm: true)." }),
  fields: z.array(z.enum(service.PRODUCT_FIELDS)).min(1).max(service.PRODUCT_FIELDS.length).optional(),
  /** Retouches de l'employé avant application (mêmes règles que la saisie manuelle). */
  edits: z.record(z.string(), z.unknown()).optional(),
  note: z.string().trim().max(1000).optional(),
}).strict();

export const aiRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.ai.status", method: "GET", path: "/admin/ai/status", surface: "admin", tags, permission: "ai.use",
    summary: "Disponibilité de l'assistant, modèle et quotas restants",
    handler: ({ db, admin }) => service.aiStatus(db, admin.shopId, admin.employeeId),
  }),
  defineRoute({
    id: "admin.ai.propose.product", method: "POST", path: "/admin/ai/proposals/product-content", surface: "admin", tags, permission: "ai.use", rateLimit: "admin.ai",
    summary: "Proposer titre, résumé, description, SEO et étiquettes d'un produit (rien n'est modifié)",
    body: z.object({ productId: z.string().uuid(), fields: z.array(z.enum(service.PRODUCT_FIELDS)).min(1).optional(), instructions, language: z.enum(["fr", "en"]).default("fr") }).strict(),
    handler: (ctx) => service.proposeProductContent(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.propose.support", method: "POST", path: "/admin/ai/proposals/support-reply", surface: "admin", tags, permission: "ai.use", rateLimit: "admin.ai",
    summary: "Proposer une réponse à un ticket (rien n'est envoyé)",
    body: z.object({ ticketId: z.string().uuid(), instructions }).strict(),
    handler: (ctx) => service.proposeSupportReply(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.propose.product_bulk", method: "POST", path: "/admin/ai/proposals/product-content/bulk", surface: "admin", tags, permission: "ai.use", rateLimit: "admin.ai",
    summary: "Génération en masse : une proposition par produit (20 au plus), rien n'est modifié",
    description: "Chaque proposition compte dans les quotas et attend sa confirmation (unitaire ou groupée). Un quota atteint arrête la série : les produits restants sont signalés « NOT_PROCESSED ».",
    body: z.object({ productIds: z.array(z.string().uuid()).min(1).max(20), fields: z.array(z.enum(service.PRODUCT_FIELDS)).min(1).optional(), instructions, language: z.enum(["fr", "en"]).default("fr") }).strict(),
    handler: (ctx) => service.proposeProductContentBulk(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.proposals.apply_bulk", method: "POST", path: "/admin/ai/proposals/apply-bulk", surface: "admin", tags, permission: "ai.use", status: 200,
    summary: "Valider plusieurs propositions (confirmation explicite, mêmes contrôles qu'une par une)",
    body: z.object({ ids: z.array(z.string().uuid()).min(1).max(20), confirm: z.literal(true, { message: "Confirmez explicitement l'application (confirm: true)." }), fields: z.array(z.enum(service.PRODUCT_FIELDS)).min(1).optional(), note: z.string().trim().max(1000).optional() }).strict(),
    handler: (ctx) => service.applyProposalsBulk(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.sales_summary", method: "POST", path: "/admin/ai/sales-summary", surface: "admin", tags, permission: "ai.use", rateLimit: "admin.ai", status: 200,
    summary: "Résumé des ventes d'une période, rédigé à partir des statistiques pré-calculées (lecture seule)",
    body: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict(),
    handler: (ctx) => service.summarizeSales(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.search", method: "POST", path: "/admin/ai/search", surface: "admin", tags, permission: "ai.use", rateLimit: "admin.ai", status: 200,
    summary: "Recherche en langage naturel dans les produits, commandes, clients et tickets (lecture seule)",
    description: "Le modèle ne voit aucune donnée : il traduit la question en requête de liste (champs et tris autorisés), revalidée puis exécutée avec les droits de l'employé.",
    body: z.object({ question: z.string().trim().min(3).max(500), limit: z.number().int().min(1).max(50).optional() }).strict(),
    handler: (ctx) => service.naturalLanguageSearch(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.proposals.list", method: "GET", path: "/admin/ai/proposals", surface: "admin", tags, permission: "ai.use",
    summary: "Propositions de l'assistant (en attente, appliquées, refusées, expirées)", list: service.proposalListSpec,
    handler: ({ db, list, admin }) => service.listProposals(db, list, admin.shopId),
  }),
  defineRoute({
    id: "admin.ai.proposals.get", method: "GET", path: "/admin/ai/proposals/:id", surface: "admin", tags, permission: "ai.use",
    summary: "Détail d'une proposition (valeurs actuelles et proposées)", params: uuidParams,
    handler: ({ db, params, admin }) => service.getProposal(db, params.id, admin.shopId),
  }),
  defineRoute({
    id: "admin.ai.proposals.apply", method: "POST", path: "/admin/ai/proposals/:id/apply", surface: "admin", tags, permission: "ai.use", status: 200,
    summary: "Appliquer une proposition, après confirmation explicite",
    description: "Exige `confirm: true`, les droits sur la cible (modifier le produit ou répondre au ticket) et une cible inchangée depuis la proposition. Une seule application ; journalisée dans l'audit.",
    params: uuidParams, body: applyBody,
    handler: (ctx) => service.applyProposal(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.proposals.reject", method: "POST", path: "/admin/ai/proposals/:id/reject", surface: "admin", tags, permission: "ai.use", status: 200,
    summary: "Refuser une proposition", params: uuidParams, body: z.object({ note: z.string().trim().max(1000).optional() }).strict(),
    handler: (ctx) => service.rejectProposal(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.ai.usage", method: "GET", path: "/admin/ai/usage", surface: "admin", tags, permission: "ai.use",
    summary: "Consommation du mois (toute l'équipe avec ai.manage, sinon la mienne)",
    handler: (ctx) => service.aiUsageReport(ctx.db, ctx.admin.shopId, actorContext(ctx)),
  }),
];
