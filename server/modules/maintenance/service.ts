/**
 * Journal des erreurs (consultation, regroupement, résolution) et nettoyage technique.
 * Le nettoyage ne touche qu'à des données techniques expirées ou anciennes (compteurs de débit,
 * clés d'idempotence, devis de transport, rapports d'import, historique des tâches, erreurs
 * résolues) : aucune donnée métier (commande, produit, client, événement) n'est supprimée.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { errorLogs, idempotencyKeys, rateLimitBuckets, scheduledTaskRuns, shippingQuotes } from "@/lib/db/schema";
import { recordAudit } from "@/server/core/audit";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { buildOrderBy, buildWhere, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import type { Context } from "@/server/modules/catalog/shared";
import { purgeOldImports } from "@/server/modules/imports/service";

/* ─────────────────────────────  Journal des erreurs  ───────────────────────────── */

export const errorLogListSpec: ListSpec = {
  sortable: { occurredAt: errorLogs.occurredAt, source: errorLogs.source, status: errorLogs.status },
  defaultSort: "-occurredAt",
  filterable: {
    source: { column: errorLogs.source, type: "enum", values: ["api", "task", "event", "page"] },
    level: { column: errorLogs.level, type: "enum", values: ["error", "warning"] },
    code: { column: errorLogs.code, type: "string" },
    route: { column: errorLogs.route, type: "string" },
    fingerprint: { column: errorLogs.fingerprint, type: "string" },
    requestId: { column: errorLogs.requestId, type: "string" },
    occurredAt: { column: errorLogs.occurredAt, type: "date" },
    resolvedAt: { column: errorLogs.resolvedAt, type: "date" },
  },
  searchable: [errorLogs.message, errorLogs.path],
};

const summaryView = (row: typeof errorLogs.$inferSelect) => ({
  id: row.id, occurredAt: row.occurredAt, level: row.level, source: row.source, code: row.code, message: row.message, fingerprint: row.fingerprint,
  requestId: row.requestId, method: row.method, path: row.path, route: row.route, status: row.status, resolvedAt: row.resolvedAt,
});

export async function listErrorLogs(database: Db, query: ListQuery) {
  const where = buildWhere(query, errorLogListSpec);
  const [rows, [total]] = await Promise.all([
    database.select().from(errorLogs).where(where).orderBy(...buildOrderBy(query, errorLogListSpec)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(errorLogs).where(where),
  ]);
  return { data: rows.map(summaryView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function getErrorLog(database: Db, id: string) {
  const [row] = await database.select().from(errorLogs).where(eq(errorLogs.id, id)).limit(1);
  if (!row) throw errors.notFound("Erreur", id);
  const [occurrences] = await database.select({ value: count() }).from(errorLogs).where(eq(errorLogs.fingerprint, row.fingerprint));
  return { ...summaryView(row), stack: row.stack, context: row.context, actor: row.actor, resolvedByEmployeeId: row.resolvedByEmployeeId, occurrences: Number(occurrences.value) };
}

/** Erreurs regroupées par empreinte : une ligne par problème, avec sa fréquence. */
export async function errorGroups(database: Db, query: { from?: string; to?: string; open?: boolean; source?: string; limit: number }) {
  const conditions: SQL[] = [];
  if (query.from) conditions.push(gte(errorLogs.occurredAt, new Date(`${query.from}T00:00:00.000Z`)));
  if (query.to) conditions.push(lte(errorLogs.occurredAt, new Date(`${query.to}T23:59:59.999Z`)));
  if (query.open) conditions.push(isNull(errorLogs.resolvedAt));
  if (query.source) conditions.push(eq(errorLogs.source, query.source));
  const rows = await database.select({
    fingerprint: errorLogs.fingerprint,
    source: sql<string>`min(${errorLogs.source})`, code: sql<string | null>`min(${errorLogs.code})`, route: sql<string | null>`min(${errorLogs.route})`,
    message: sql<string>`(array_agg(${errorLogs.message} order by ${errorLogs.occurredAt} desc))[1]`,
    sampleId: sql<string>`(array_agg(${errorLogs.id} order by ${errorLogs.occurredAt} desc))[1]`,
    occurrences: sql<number>`count(*)::int`, open: sql<number>`(count(*) filter (where ${errorLogs.resolvedAt} is null))::int`,
    firstSeen: sql<Date>`min(${errorLogs.occurredAt})`, lastSeen: sql<Date>`max(${errorLogs.occurredAt})`,
  }).from(errorLogs).where(conditions.length ? and(...conditions) : undefined).groupBy(errorLogs.fingerprint)
    .orderBy(desc(sql`max(${errorLogs.occurredAt})`)).limit(query.limit);
  return rows.map((row) => ({ ...row, occurrences: Number(row.occurrences), open: Number(row.open), firstSeen: new Date(row.firstSeen).toISOString(), lastSeen: new Date(row.lastSeen).toISOString() }));
}

/** Marque des erreurs comme résolues : par identifiants, ou toutes les occurrences d'une empreinte. */
export async function resolveErrors(database: Db, input: { ids?: string[]; fingerprint?: string }, context: Context) {
  if (!input.ids?.length && !input.fingerprint) throw errors.validation([{ path: "ids", message: "Indiquez des identifiants ou une empreinte." }]);
  const target = input.ids?.length ? inArray(errorLogs.id, input.ids) : eq(errorLogs.fingerprint, input.fingerprint!);
  const updated = await database.update(errorLogs).set({ resolvedAt: new Date(), resolvedByEmployeeId: context.actor.employeeId })
    .where(and(target, isNull(errorLogs.resolvedAt))).returning({ id: errorLogs.id });
  await recordAudit(database, { action: "error_logs.resolved", entityType: "error_log", entityId: input.fingerprint ?? input.ids![0], details: { count: updated.length, fingerprint: input.fingerprint ?? null }, actor: context.actor, meta: context.meta });
  return { resolved: updated.length };
}

/* ─────────────────────────────  Nettoyage  ───────────────────────────── */

/** Devis de transport expirés (gardés 30 minutes pour prouver le prix annoncé), par lots de 500. */
export async function purgeExpiredShippingQuotes(database: Db, now = new Date()) {
  let deleted = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const expired = await database.select({ id: shippingQuotes.id }).from(shippingQuotes).where(lt(shippingQuotes.expiresAt, now)).limit(500);
    if (!expired.length) break;
    const removed = await database.delete(shippingQuotes).where(inArray(shippingQuotes.id, expired.map((row) => row.id))).returning({ id: shippingQuotes.id });
    deleted += removed.length;
  }
  return { deleted };
}

export const RETENTION_DAYS = { importReports: 90, taskRuns: 90, resolvedErrors: 90, openErrors: 180 } as const;

export async function purgeTechnicalData(database: Db, now = new Date()) {
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const [buckets, keys, runs, resolvedErrors, oldErrors, imports] = await Promise.all([
    database.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now)).returning({ key: rateLimitBuckets.key }),
    database.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, now)).returning({ id: idempotencyKeys.id }),
    database.delete(scheduledTaskRuns).where(lt(scheduledTaskRuns.startedAt, daysAgo(RETENTION_DAYS.taskRuns))).returning({ id: scheduledTaskRuns.id }),
    database.delete(errorLogs).where(and(isNotNull(errorLogs.resolvedAt), lt(errorLogs.resolvedAt, daysAgo(RETENTION_DAYS.resolvedErrors)))).returning({ id: errorLogs.id }),
    database.delete(errorLogs).where(and(isNull(errorLogs.resolvedAt), lt(errorLogs.occurredAt, daysAgo(RETENTION_DAYS.openErrors)))).returning({ id: errorLogs.id }),
    purgeOldImports(database, RETENTION_DAYS.importReports),
  ]);
  return { rateLimitBuckets: buckets.length, idempotencyKeys: keys.length, taskRuns: runs.length, errorLogs: resolvedErrors.length + oldErrors.length, importReports: imports };
}
