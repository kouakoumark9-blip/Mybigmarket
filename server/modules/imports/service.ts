/**
 * Imports CSV (étape 7).
 *
 * 1. **Analyse et simulation** (`analyzeImport`) : le fichier est lu, chaque colonne reconnue, et
 *    chaque ligne validée contre l'état réel du catalogue (références, catégories, marques, vendeurs,
 *    doublons du fichier). Rien n'est écrit dans le catalogue : seul le rapport est enregistré.
 * 2. **Import** (`startImport`) : les lignes valides sont écrites une par une, dans l'ordre du fichier,
 *    par les services de l'administration. Une ligne en erreur n'empêche pas les autres.
 * 3. **Lots** (`processImportBatch`) : un lot s'arrête au bout de quelques secondes et reprend où il
 *    s'est arrêté (requête suivante, traitement après la réponse, ou tâche planifiée). Un verrou
 *    garantit qu'un seul lot tourne à la fois et qu'aucune ligne n'est écrite deux fois.
 */
import { and, asc, count, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { importJobRows, importJobs } from "@/lib/db/schema";
import { principalForEmployee, assertPermission, type AdminPrincipal } from "@/server/core/auth/principal";
import { recordAudit } from "@/server/core/audit";
import { normalizeHeader, parseCsvRecords, toCsv } from "@/server/core/csv";
import type { Db } from "@/server/core/db";
import { AppError, errors, fromDatabaseError } from "@/server/core/errors";
import { logger, errorContext } from "@/server/core/logger";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import type { Context } from "@/server/modules/catalog/shared";
import { productsEntity } from "@/server/modules/imports/entities/products";
import { brandsEntity, categoriesEntity } from "@/server/modules/imports/entities/taxonomy";
import type { ImportRow, RowMessage } from "@/server/modules/imports/parsers";
import type { ImportEntity, PlannedAction } from "@/server/modules/imports/types";

export const IMPORT_ENTITIES = { products: productsEntity, categories: categoriesEntity, brands: brandsEntity } as unknown as Record<string, ImportEntity<Record<string, unknown>>>;
export type ImportEntityCode = "products" | "categories" | "brands";

export const MAX_IMPORT_ROWS = 5000;
const ROW_INSERT_CHUNK = 500;
const LOCK_SECONDS = 60;
/** Durée d'un lot pendant une requête : compatible avec les limites d'exécution les plus courtes. */
export const REQUEST_BATCH_MS = 8_000;

export function importEntity(code: string): ImportEntity<Record<string, unknown>> {
  const entity = IMPORT_ENTITIES[code];
  if (!entity) throw errors.notFound("Type d'import", code);
  return entity;
}

/** Colonnes et options de chaque type d'import (aide du back-office). */
export function importEntities() {
  return Object.values(IMPORT_ENTITIES).map((entity) => ({
    code: entity.code, label: entity.label, identifyingColumns: entity.identifyingColumns, maxRows: MAX_IMPORT_ROWS,
    columns: entity.columns.map(({ key, label, aliases, description, example, requiredForCreate }) => ({ key, label, aliases, description, example, requiredForCreate: Boolean(requiredForCreate) })),
  }));
}

/** Modèle CSV : en-têtes canoniques et une ligne d'exemple. */
export function importTemplate(code: string): string {
  const entity = importEntity(code);
  return toCsv(entity.columns.map((column) => column.key), [entity.columns.map((column) => column.example)]);
}

/* ─────────────────────────────  Analyse  ───────────────────────────── */

type Parsed = { rows: ImportRow[]; columns: Array<{ header: string; key: string | null }>; warnings: string[] };

function readFile(entity: ImportEntity<Record<string, unknown>>, csv: string): Parsed {
  const records = parseCsvRecords(csv);
  if (records.length < 2) throw errors.validation([{ path: "csv", message: "Le fichier doit contenir une ligne d'en-tête et au moins une ligne de données." }]);
  if (records.length - 1 > MAX_IMPORT_ROWS) throw errors.validation([{ path: "csv", message: `${MAX_IMPORT_ROWS} lignes au maximum par import : découpez le fichier.` }]);
  const aliases = new Map<string, string>();
  for (const column of entity.columns) for (const alias of [column.key, ...column.aliases]) aliases.set(normalizeHeader(alias), column.key);
  const header = records[0].cells;
  const columns = header.map((cell) => ({ header: cell.trim(), key: aliases.get(normalizeHeader(cell)) ?? null }));
  const seen = new Map<string, string>();
  for (const column of columns) {
    if (!column.key) continue;
    const previous = seen.get(column.key);
    if (previous !== undefined) throw errors.validation([{ path: "csv", message: `Les colonnes « ${previous} » et « ${column.header} » désignent la même donnée (${column.key}).` }]);
    seen.set(column.key, column.header);
  }
  if (!entity.identifyingColumns.some((key) => seen.has(key))) {
    throw errors.validation([{ path: "csv", message: `Colonne requise : ${entity.identifyingColumns.join(" ou ")}. Téléchargez le modèle pour voir les en-têtes reconnus.` }]);
  }
  const warnings: string[] = [];
  const ignored = columns.filter((column) => !column.key && column.header).map((column) => column.header);
  if (ignored.length) warnings.push(`Colonnes ignorées (non reconnues) : ${ignored.join(", ")}.`);
  const rows = records.slice(1).map((record) => {
    const data: Record<string, string> = {};
    columns.forEach((column, index) => { if (column.key) data[column.key] = (record.cells[index] ?? "").trim(); });
    return { line: record.line, data };
  });
  const ragged = records.slice(1).filter((record) => record.cells.length > header.length).map((record) => record.line);
  if (ragged.length) warnings.push(`Lignes avec plus de cellules que d'en-têtes (cellules en trop ignorées) : ${ragged.slice(0, 20).join(", ")}${ragged.length > 20 ? "…" : ""}.`);
  return { rows, columns, warnings };
}

function statusFor(action: PlannedAction): "pending" | "skipped" | "error" {
  return action === "error" ? "error" : action === "skip" ? "skipped" : "pending";
}

export type AnalyzeInput = { entity: ImportEntityCode; csv: string; fileName?: string; options?: Record<string, unknown> };

export async function analyzeImport(database: Db, input: AnalyzeInput, context: Context) {
  const entity = importEntity(input.entity);
  assertPermission(context.actor, "catalog.import");
  const options = entity.optionsSchema.safeParse(input.options ?? {});
  if (!options.success) throw errors.validation(options.error.issues.map((issue) => ({ path: `options.${issue.path.join(".")}`, message: issue.message })));
  const parsed = readFile(entity, input.csv);
  const plan = await entity.planner(database, parsed.rows, options.data, context.actor);
  const planned = parsed.rows.map((row) => {
    try {
      const result = plan(row);
      return { row, action: result.action, messages: result.messages };
    } catch (error) {
      return { row, action: "error" as const, messages: [{ level: "error" as const, message: error instanceof Error ? error.message : String(error) }] };
    }
  });
  const counts = { create: 0, update: 0, skip: 0, error: 0 };
  for (const entry of planned) counts[entry.action] += 1;
  const warningsCount = planned.reduce((sum, entry) => sum + entry.messages.filter((message) => message.level === "warning").length, 0);

  const jobId = await database.transaction(async (tx) => {
    const [job] = await tx.insert(importJobs).values({
      shopId: context.actor.shopId, entity: entity.code, status: "simulated", fileName: input.fileName?.slice(0, 200) ?? null, options: options.data,
      summary: { columns: parsed.columns, warnings: parsed.warnings, planned: counts, warningsCount },
      totalRows: parsed.rows.length, createdByEmployeeId: context.actor.employeeId,
      skippedCount: counts.skip, errorCount: counts.error, processedRows: counts.skip + counts.error,
    }).returning({ id: importJobs.id });
    for (let start = 0; start < planned.length; start += ROW_INSERT_CHUNK) {
      await tx.insert(importJobRows).values(planned.slice(start, start + ROW_INSERT_CHUNK).map((entry) => ({
        jobId: job.id, line: entry.row.line, data: entry.row.data, plannedAction: entry.action, status: statusFor(entry.action), messages: entry.messages,
      })));
    }
    await recordAudit(tx, { action: "import.simulated", entityType: "import", entityId: job.id, details: { entity: entity.code, fileName: input.fileName ?? null, rows: parsed.rows.length, ...counts }, actor: context.actor, meta: context.meta });
    return job.id;
  });
  return getImport(database, jobId, { withProblems: true });
}

/* ─────────────────────────────  Lecture  ───────────────────────────── */

type JobRow = typeof importJobs.$inferSelect;

function jobView(job: JobRow) {
  const summary = job.summary as { planned?: Record<string, number>; warnings?: string[]; columns?: unknown; warningsCount?: number };
  return {
    id: job.id, entity: job.entity, status: job.status, fileName: job.fileName, options: job.options,
    totalRows: job.totalRows, planned: summary.planned ?? null, warnings: summary.warnings ?? [], warningsCount: summary.warningsCount ?? 0, columns: summary.columns ?? [],
    progress: {
      processed: job.processedRows, created: job.createdCount, updated: job.updatedCount, skipped: job.skippedCount, errors: job.errorCount,
      remaining: Math.max(0, job.totalRows - job.processedRows), percent: job.totalRows ? Math.floor((job.processedRows / job.totalRows) * 100) : 100,
    },
    createdByEmployeeId: job.createdByEmployeeId, createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt, updatedAt: job.updatedAt,
  };
}

type RowRecord = typeof importJobRows.$inferSelect;
const rowView = (row: RowRecord) => ({ line: row.line, plannedAction: row.plannedAction, status: row.status, entityId: row.entityId, messages: row.messages, data: row.data, processedAt: row.processedAt });

async function findJob(database: Db, id: string) {
  const [job] = await database.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
  if (!job) throw errors.notFound("Import", id);
  return job;
}

export async function getImport(database: Db, id: string, options: { withProblems?: boolean } = {}) {
  const job = await findJob(database, id);
  const view = jobView(job);
  if (!options.withProblems) return view;
  // Premières lignes à corriger ou à surveiller (le détail complet : /rows et /report.csv).
  const problems = await database.select().from(importJobRows)
    .where(and(eq(importJobRows.jobId, id), sql`(${importJobRows.status} = 'error' or jsonb_array_length(${importJobRows.messages}) > 0)`))
    .orderBy(asc(importJobRows.line)).limit(100);
  return { ...view, problems: problems.map(rowView) };
}

export const importListSpec: ListSpec = {
  sortable: { createdAt: importJobs.createdAt, status: importJobs.status, entity: importJobs.entity },
  defaultSort: "-createdAt",
  filterable: {
    status: { column: importJobs.status, type: "enum", values: ["simulated", "queued", "running", "completed", "failed", "cancelled"] },
    entity: { column: importJobs.entity, type: "enum", values: ["products", "categories", "brands"] },
    createdAt: { column: importJobs.createdAt, type: "date" },
  },
};

export async function listImports(database: Db, query: ListQuery, shopId: string) {
  const where = buildWhere(query, importListSpec, [eq(importJobs.shopId, shopId)]);
  const [rows, [total]] = await Promise.all([
    database.select().from(importJobs).where(where).orderBy(...buildOrderBy(query, importListSpec)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(importJobs).where(where),
  ]);
  return { data: rows.map(jobView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function importRows(database: Db, id: string, query: { status?: string; page: number; limit: number }) {
  await findJob(database, id);
  const where = and(eq(importJobRows.jobId, id), query.status ? eq(importJobRows.status, query.status) : undefined);
  const [rows, [total]] = await Promise.all([
    database.select().from(importJobRows).where(where).orderBy(asc(importJobRows.line)).limit(query.limit).offset((query.page - 1) * query.limit),
    database.select({ value: count() }).from(importJobRows).where(where),
  ]);
  const totalCount = Number(total?.value ?? 0);
  return { data: rows.map(rowView), meta: { page: query.page, limit: query.limit, total: totalCount, totalPages: Math.max(1, Math.ceil(totalCount / query.limit)) } };
}

const ACTION_LABELS: Record<string, string> = { create: "création", update: "mise à jour", skip: "ignorée", error: "erreur" };
const STATUS_LABELS: Record<string, string> = { pending: "en attente", created: "créé", updated: "mis à jour", skipped: "ignoré", error: "erreur" };

/** Rapport CSV ligne par ligne (à ouvrir dans un tableur pour corriger le fichier). */
export async function importReportCsv(database: Db, id: string): Promise<string> {
  const job = await findJob(database, id);
  const rows = await database.select().from(importJobRows).where(eq(importJobRows.jobId, id)).orderBy(asc(importJobRows.line));
  const columns = ((job.summary as { columns?: Array<{ key: string | null }> }).columns ?? []).map((column) => column.key).filter((key): key is string => Boolean(key));
  const describe = (messages: RowMessage[]) => messages.map((message) => `${message.level === "error" ? "Erreur" : "Attention"}${message.field ? ` (${message.field})` : ""} : ${message.message}`).join(" | ");
  return toCsv(["ligne", "action_prevue", "resultat", "identifiant", "messages", ...columns],
    rows.map((row) => [row.line, ACTION_LABELS[row.plannedAction] ?? row.plannedAction, STATUS_LABELS[row.status] ?? row.status, row.entityId, describe(row.messages), ...columns.map((key) => row.data[key] ?? "")]));
}

/* ─────────────────────────────  Import réel, par lots  ───────────────────────────── */

async function refreshCounters(database: Db, jobId: string) {
  const rows = await database.select({ status: importJobRows.status, value: count() }).from(importJobRows).where(eq(importJobRows.jobId, jobId)).groupBy(importJobRows.status);
  const by = Object.fromEntries(rows.map((row) => [row.status, Number(row.value)])) as Record<string, number>;
  const pending = by.pending ?? 0;
  const processed = (by.created ?? 0) + (by.updated ?? 0) + (by.skipped ?? 0) + (by.error ?? 0);
  await database.update(importJobs).set({
    processedRows: processed, createdCount: by.created ?? 0, updatedCount: by.updated ?? 0, skippedCount: by.skipped ?? 0, errorCount: by.error ?? 0, updatedAt: new Date(),
  }).where(eq(importJobs.id, jobId));
  return pending;
}

/** Lance l'import d'une simulation : les lignes valides seront écrites. */
export async function startImport(database: Db, id: string, context: Context, batch: Omit<BatchOptions, "actor" | "meta"> = {}) {
  assertPermission(context.actor, "catalog.import");
  const job = await findJob(database, id);
  if (job.shopId !== context.actor.shopId) throw errors.notFound("Import", id);
  const entity = importEntity(job.entity);
  assertPermission(context.actor, entity.permissions.create);
  assertPermission(context.actor, entity.permissions.update);
  const [started] = await database.update(importJobs).set({ status: "queued", startedAt: new Date(), updatedAt: new Date(), createdByEmployeeId: context.actor.employeeId ?? job.createdByEmployeeId })
    .where(and(eq(importJobs.id, id), eq(importJobs.status, "simulated"))).returning({ id: importJobs.id });
  if (!started) throw errors.conflict(`Cet import est déjà « ${job.status} » : seule une simulation peut être lancée.`, { status: job.status });
  await recordAudit(database, { action: "import.started", entityType: "import", entityId: id, details: { entity: job.entity, rows: job.totalRows }, actor: context.actor, meta: context.meta });
  return processImportBatch(database, id, { ...batch, actor: context.actor, meta: context.meta });
}

export type BatchOptions = { actor?: AdminPrincipal; meta?: Context["meta"]; budgetMs?: number; chunkSize?: number; /** Lignes au plus pour ce lot. */ maxRows?: number };

/**
 * Traite des lignes en attente pendant `budgetMs` au plus. Rend l'état de l'import.
 * Sans verrou disponible (un autre lot tourne), rend l'état sans rien faire.
 */
export async function processImportBatch(database: Db, id: string, options: BatchOptions = {}) {
  const budgetMs = options.budgetMs ?? REQUEST_BATCH_MS;
  const chunkSize = options.chunkSize ?? 50;
  let quota = options.maxRows ?? Number.POSITIVE_INFINITY;
  const started = Date.now();
  const [job] = await database.update(importJobs)
    .set({ status: "running", lockedUntil: sql`now() + make_interval(secs => ${LOCK_SECONDS})`, updatedAt: new Date() })
    .where(and(eq(importJobs.id, id), inArray(importJobs.status, ["queued", "running"]), or(isNull(importJobs.lockedUntil), lt(importJobs.lockedUntil, sql`now()`))))
    .returning();
  if (!job) return getImport(database, id);
  try {
    const entity = importEntity(job.entity);
    const actor = options.actor ?? (job.createdByEmployeeId ? await principalForEmployee(database, job.createdByEmployeeId) : null);
    if (!actor || !actor.permissions.has("catalog.import")) {
      await database.update(importJobs).set({ status: "failed", lockedUntil: null, finishedAt: new Date(), updatedAt: new Date() }).where(eq(importJobs.id, id));
      throw errors.forbidden("catalog.import");
    }
    const context: Context = { actor, meta: options.meta };
    const parsedOptions = entity.optionsSchema.parse(job.options ?? {});
    while (Date.now() - started < budgetMs && quota > 0) {
      const [current] = await database.select({ status: importJobs.status }).from(importJobs).where(eq(importJobs.id, id)).limit(1);
      if (current?.status !== "running") break;
      const pending = await database.select().from(importJobRows).where(and(eq(importJobRows.jobId, id), eq(importJobRows.status, "pending"))).orderBy(asc(importJobRows.line)).limit(Math.min(chunkSize, quota));
      if (!pending.length) break;
      // Planification à nouveau, sur l'état actuel du catalogue (les lignes précédentes ont pu le modifier).
      const plan = await entity.planner(database, pending.map((row) => ({ line: row.line, data: row.data })), parsedOptions, actor);
      for (const row of pending) {
        if (Date.now() - started >= budgetMs || quota <= 0) break;
        quota -= 1;
        let status: "created" | "updated" | "skipped" | "error";
        let messages: RowMessage[] = row.messages;
        let entityId: string | null = null;
        try {
          const result = plan({ line: row.line, data: row.data });
          messages = result.messages;
          if (result.action === "error" || !result.apply) status = result.action === "skip" ? "skipped" : "error";
          else {
            const applied = await result.apply(database, context);
            status = applied.status;
            entityId = applied.entityId;
            if (applied.messages) messages = [...messages, ...applied.messages];
          }
        } catch (error) {
          status = "error";
          messages = [...messages.filter((message) => message.level === "warning"), ...messagesFromError(error)];
        }
        await database.update(importJobRows).set({ status, messages, entityId, processedAt: new Date() }).where(and(eq(importJobRows.id, row.id), eq(importJobRows.status, "pending")));
      }
      await database.update(importJobs).set({ lockedUntil: sql`now() + make_interval(secs => ${LOCK_SECONDS})` }).where(eq(importJobs.id, id));
    }
    const remaining = await refreshCounters(database, id);
    const [current] = await database.select().from(importJobs).where(eq(importJobs.id, id)).limit(1);
    if (remaining === 0 && current?.status === "running") {
      await database.update(importJobs).set({ status: "completed", finishedAt: new Date(), lockedUntil: null, updatedAt: new Date() }).where(eq(importJobs.id, id));
      await recordAudit(database, { action: "import.completed", entityType: "import", entityId: id, details: { entity: job.entity, created: current.createdCount, updated: current.updatedCount, skipped: current.skippedCount, errors: current.errorCount }, actor, meta: options.meta });
    } else {
      await database.update(importJobs).set({ lockedUntil: null }).where(eq(importJobs.id, id));
    }
  } catch (error) {
    await database.update(importJobs).set({ lockedUntil: null }).where(eq(importJobs.id, id)).catch(() => undefined);
    if (error instanceof AppError) throw error;
    logger.error("import.batch_failed", { importId: id, ...errorContext(error) });
    throw error;
  }
  return getImport(database, id);
}

function messagesFromError(error: unknown): RowMessage[] {
  const appError = error instanceof AppError ? error : fromDatabaseError(error);
  if (appError) {
    const issues = Array.isArray(appError.details) ? (appError.details as Array<{ path?: string; message?: string }>) : [];
    if (issues.length && issues.every((issue) => typeof issue.message === "string")) return issues.map((issue) => ({ field: issue.path || undefined, level: "error", message: issue.message as string }));
    return [{ level: "error", message: appError.message }];
  }
  logger.warn("import.row_failed", errorContext(error));
  return [{ level: "error", message: error instanceof Error ? error.message : "Erreur inattendue." }];
}

/**
 * Suite de l'import juste après la réponse HTTP (fonction `after` de Next.js), par lots successifs,
 * tant qu'ils avancent. Si la fonction est interrompue, la requête suivante ou la tâche planifiée reprend.
 */
export async function continueInBackground(database: () => Db, id: string, actor: AdminPrincipal, totalMs = 40_000) {
  try {
    const { after } = await import("next/server");
    after(async () => {
      const deadline = Date.now() + totalMs;
      let processed = -1;
      while (Date.now() < deadline - 1_000) {
        const view = await processImportBatch(database(), id, { actor, budgetMs: Math.min(REQUEST_BATCH_MS, deadline - Date.now()) }).catch((error) => {
          logger.warn("import.background_failed", { importId: id, ...errorContext(error) });
          return null;
        });
        if (!view || view.status !== "running" || view.progress.remaining === 0 || view.progress.processed === processed) break;
        processed = view.progress.processed;
      }
    });
  } catch {
    // Hors requête Next (tests, scripts) : reprise par /process ou par la tâche planifiée.
  }
}

/** Arrête un import : les lignes non traitées sont marquées ignorées. */
export async function cancelImport(database: Db, id: string, context: Context) {
  const job = await findJob(database, id);
  if (job.shopId !== context.actor.shopId) throw errors.notFound("Import", id);
  if (!["simulated", "queued", "running"].includes(job.status)) throw errors.conflict(`Import déjà « ${job.status} ».`, { status: job.status });
  await database.update(importJobs).set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() }).where(eq(importJobs.id, id));
  await database.update(importJobRows).set({ status: "skipped", messages: sql`${importJobRows.messages} || '[{"level":"warning","message":"Import annulé avant le traitement de cette ligne."}]'::jsonb`, processedAt: new Date() })
    .where(and(eq(importJobRows.jobId, id), eq(importJobRows.status, "pending")));
  await refreshCounters(database, id);
  await recordAudit(database, { action: "import.cancelled", entityType: "import", entityId: id, actor: context.actor, meta: context.meta });
  return getImport(database, id);
}

/** Tâche planifiée : reprend les imports en cours interrompus (fonction coupée, onglet fermé). */
export async function resumePendingImports(database: Db, options: { budgetMs?: number } = {}) {
  const jobs = await database.select({ id: importJobs.id }).from(importJobs)
    .where(and(inArray(importJobs.status, ["queued", "running"]), or(isNull(importJobs.lockedUntil), lt(importJobs.lockedUntil, sql`now()`))))
    .orderBy(asc(importJobs.createdAt)).limit(5);
  const results: Array<{ id: string; status: string; remaining: number }> = [];
  for (const job of jobs) {
    try {
      const view = await processImportBatch(database, job.id, { budgetMs: options.budgetMs ?? 20_000 });
      results.push({ id: job.id, status: view.status, remaining: view.progress.remaining });
    } catch (error) {
      results.push({ id: job.id, status: "failed", remaining: -1 });
      logger.warn("import.resume_failed", { importId: job.id, ...errorContext(error) });
    }
  }
  return { resumed: results.length, jobs: results };
}

/** Purge des rapports de plus de `days` jours (les produits importés restent). */
export async function purgeOldImports(database: Db, days = 90) {
  const deleted = await database.delete(importJobs)
    .where(and(inArray(importJobs.status, ["simulated", "completed", "failed", "cancelled"]), lt(importJobs.createdAt, sql`now() - make_interval(days => ${days})`)))
    .returning({ id: importJobs.id });
  return deleted.length;
}

