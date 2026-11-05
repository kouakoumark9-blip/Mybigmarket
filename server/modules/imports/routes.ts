import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/imports/service";

const tags = ["Import / export"];
const entityParams = z.object({ entity: z.enum(["products", "categories", "brands"]) });

/** 4 Mo : la limite de corps de requête des fonctions Vercel est de 4,5 Mo. */
const MAX_IMPORT_BYTES = 4_000_000;

const analyzeBody = z.object({
  entity: z.enum(["products", "categories", "brands"]),
  /** Contenu du fichier CSV (UTF-8 ; séparateur « ; », « , » ou tabulation détecté). */
  csv: z.string().min(1).max(MAX_IMPORT_BYTES),
  fileName: z.string().trim().max(200).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  /** Vrai : lance l'import juste après l'analyse (les lignes en erreur sont écartées). */
  run: z.boolean().default(false),
}).strict();

const rowsQuery = z.object({
  status: z.enum(["pending", "created", "updated", "skipped", "error"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

const csvHeaders = (fileName: string, requestId: string) => ({
  "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store", "x-request-id": requestId,
});

export const importRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.imports.entities", method: "GET", path: "/admin/imports/entities", surface: "admin", tags, permission: "catalog.import",
    summary: "Types d'import, colonnes reconnues et options",
    handler: async () => service.importEntities(),
  }),
  defineRoute({
    id: "admin.imports.template", method: "GET", path: "/admin/imports/templates/:entity", surface: "admin", tags, permission: "catalog.import",
    summary: "Modèle CSV (en-têtes et ligne d'exemple)", params: entityParams,
    handler: async ({ params, meta }) => new Response(service.importTemplate(params.entity), { headers: csvHeaders(`modele-import-${params.entity}.csv`, meta.requestId) }),
  }),
  defineRoute({
    id: "admin.imports.list", method: "GET", path: "/admin/imports", surface: "admin", tags, permission: "catalog.import",
    summary: "Imports (simulations et imports réels)", list: service.importListSpec,
    handler: ({ db, list, admin }) => service.listImports(db, list, admin.shopId),
  }),
  defineRoute({
    id: "admin.imports.analyze", method: "POST", path: "/admin/imports", surface: "admin", tags, permission: "catalog.import", maxBodyBytes: MAX_IMPORT_BYTES + 100_000,
    summary: "Analyser un fichier CSV (simulation), et le lancer si `run`",
    description: "La simulation valide chaque ligne contre le catalogue réel sans rien y écrire et renvoie le rapport (actions prévues, erreurs et avertissements par ligne). 5 000 lignes au plus.",
    body: analyzeBody,
    handler: async (ctx) => {
      const { run, ...input } = ctx.body;
      const simulated = await service.analyzeImport(ctx.db, input, actorContext(ctx));
      if (!run) return simulated;
      const started = await service.startImport(ctx.db, simulated.id, actorContext(ctx));
      if (started.status === "running") await service.continueInBackground(() => ctx.db, simulated.id, ctx.admin);
      return started;
    },
  }),
  defineRoute({
    id: "admin.imports.get", method: "GET", path: "/admin/imports/:id", surface: "admin", tags, permission: "catalog.import",
    summary: "État d'un import et premières lignes à corriger", params: uuidParams,
    handler: ({ db, params }) => service.getImport(db, params.id, { withProblems: true }),
  }),
  defineRoute({
    id: "admin.imports.rows", method: "GET", path: "/admin/imports/:id/rows", surface: "admin", tags, permission: "catalog.import",
    summary: "Rapport ligne par ligne (filtrable par résultat)", params: uuidParams, query: rowsQuery,
    handler: ({ db, params, query }) => service.importRows(db, params.id, query),
  }),
  defineRoute({
    id: "admin.imports.report", method: "GET", path: "/admin/imports/:id/report.csv", surface: "admin", tags, permission: "catalog.import",
    summary: "Rapport CSV (ligne, action, résultat, messages, valeurs lues)", params: uuidParams,
    handler: async ({ db, params, meta }) => new Response(await service.importReportCsv(db, params.id), { headers: csvHeaders(`rapport-import-${params.id.slice(0, 8)}.csv`, meta.requestId) }),
  }),
  defineRoute({
    id: "admin.imports.run", method: "POST", path: "/admin/imports/:id/run", surface: "admin", tags, permission: "catalog.import", status: 200,
    summary: "Lancer l'import d'une simulation", description: "Écrit les lignes valides, dans l'ordre du fichier, par lots. Le traitement continue après la réponse ; `POST /process` le fait avancer ou le reprend.",
    params: uuidParams,
    handler: async (ctx) => {
      const view = await service.startImport(ctx.db, ctx.params.id, actorContext(ctx));
      if (view.status === "running") await service.continueInBackground(() => ctx.db, ctx.params.id, ctx.admin);
      return view;
    },
  }),
  defineRoute({
    id: "admin.imports.process", method: "POST", path: "/admin/imports/:id/process", surface: "admin", tags, permission: "catalog.import", status: 200,
    summary: "Faire avancer un import en cours (un lot)", params: uuidParams,
    handler: (ctx) => service.processImportBatch(ctx.db, ctx.params.id, { actor: ctx.admin, meta: ctx.meta }),
  }),
  defineRoute({
    id: "admin.imports.cancel", method: "POST", path: "/admin/imports/:id/cancel", surface: "admin", tags, permission: "catalog.import", status: 200,
    summary: "Arrêter un import (les lignes non traitées sont ignorées)", params: uuidParams,
    handler: (ctx) => service.cancelImport(ctx.db, ctx.params.id, actorContext(ctx)),
  }),
];
