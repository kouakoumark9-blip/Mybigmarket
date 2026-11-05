import { z } from "zod";
import { recordAudit } from "@/server/core/audit";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { listTasks, runTask, setTaskEnabled, taskRuns } from "@/server/core/tasks";
import { actorContext, queryBoolean, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/maintenance/service";
import "@/server/modules/maintenance/tasks";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ.");
const taskParams = z.object({ code: z.string().regex(/^[a-z0-9_.]{2,60}$/, "Code de tâche invalide.") });

export const maintenanceRoutes: AnyRoute[] = [
  // Journal des erreurs
  defineRoute({
    id: "admin.error_logs.list", method: "GET", path: "/admin/error-logs", surface: "admin", tags: ["Journaux"], permission: "logs.read",
    summary: "Journal des erreurs (API, tâches planifiées, événements)", list: service.errorLogListSpec,
    description: "`filter[resolvedAt][null]=true` : erreurs non résolues. `q` : recherche dans le message et le chemin.",
    handler: ({ db, list }) => service.listErrorLogs(db, list),
  }),
  defineRoute({
    id: "admin.error_logs.groups", method: "GET", path: "/admin/error-logs/groups", surface: "admin", tags: ["Journaux"], permission: "logs.read",
    summary: "Erreurs regroupées par problème (fréquence, première et dernière occurrence)",
    query: z.object({ from: day.optional(), to: day.optional(), open: queryBoolean.optional(), source: z.enum(["api", "task", "event", "page"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).strict(),
    handler: ({ db, query }) => service.errorGroups(db, query),
  }),
  defineRoute({
    id: "admin.error_logs.get", method: "GET", path: "/admin/error-logs/:id", surface: "admin", tags: ["Journaux"], permission: "logs.read",
    summary: "Détail d'une erreur (pile, contexte, nombre d'occurrences)", params: uuidParams,
    handler: ({ db, params }) => service.getErrorLog(db, params.id),
  }),
  defineRoute({
    id: "admin.error_logs.resolve", method: "POST", path: "/admin/error-logs/resolve", surface: "admin", tags: ["Journaux"], permission: "system.manage", status: 200,
    summary: "Marquer des erreurs comme résolues (identifiants ou empreinte)",
    body: z.object({ ids: z.array(z.string().uuid()).max(500).optional(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
    handler: (ctx) => service.resolveErrors(ctx.db, ctx.body, actorContext(ctx)),
  }),
  // Tâches planifiées
  defineRoute({
    id: "admin.tasks.list", method: "GET", path: "/admin/tasks", surface: "admin", tags: ["Système"], permission: "system.read",
    summary: "Tâches planifiées : fréquence, activation, dernier passage",
    handler: ({ db }) => listTasks(db),
  }),
  defineRoute({
    id: "admin.tasks.update", method: "PATCH", path: "/admin/tasks/:code", surface: "admin", tags: ["Système"], permission: "system.manage",
    summary: "Activer ou désactiver une tâche planifiée", params: taskParams, body: z.object({ isEnabled: z.boolean() }).strict(),
    handler: async (ctx) => {
      const task = await setTaskEnabled(ctx.db, ctx.params.code, ctx.body.isEnabled);
      await recordAudit(ctx.db, { action: ctx.body.isEnabled ? "task.enabled" : "task.disabled", entityType: "scheduled_task", entityId: ctx.params.code, actor: ctx.admin, meta: ctx.meta });
      return task;
    },
  }),
  defineRoute({
    id: "admin.tasks.run", method: "POST", path: "/admin/tasks/:code/run", surface: "admin", tags: ["Système"], permission: "system.manage", status: 200,
    summary: "Exécuter une tâche maintenant", description: "Refusée (`skipped`) si une exécution est déjà en cours. Possible même si la tâche est désactivée.",
    params: taskParams,
    handler: async (ctx) => {
      const result = await runTask(ctx.db, ctx.params.code, { trigger: "manual", actor: ctx.admin });
      await recordAudit(ctx.db, { action: "task.run", entityType: "scheduled_task", entityId: ctx.params.code, details: { status: result.status, runId: result.runId }, actor: ctx.admin, meta: ctx.meta });
      return result;
    },
  }),
  defineRoute({
    id: "admin.tasks.runs", method: "GET", path: "/admin/tasks/:code/runs", surface: "admin", tags: ["Système"], permission: "system.read",
    summary: "Historique des exécutions d'une tâche", params: taskParams,
    query: z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict(),
    handler: ({ db, params, query }) => taskRuns(db, params.code, query),
  }),
];
