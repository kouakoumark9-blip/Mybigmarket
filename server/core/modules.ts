/**
 * Registre de modules activables.
 *
 * Un module déclare son code, sa version, son schéma de configuration, les événements
 * auxquels il s'abonne, ses éventuelles routes et ses migrations SQL. Le code des modules
 * est livré avec l'application ; la base (table `modules`) mémorise l'activation et la
 * configuration, modifiables depuis l'administration sans redéploiement.
 */
import { eq } from "drizzle-orm";
import { z, type ZodType } from "zod";
import { modules as modulesTable } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { errors, zodIssues } from "@/server/core/errors";
import { recordAudit, type AuditActor } from "@/server/core/audit";
import { emitEvent, setSubscriberSource, type DomainEventName, type EventHandler, type Subscriber } from "@/server/core/events";
import type { AnyRoute } from "@/server/core/http/route";
import type { RequestMeta } from "@/server/core/http/request-context";

export type ModuleDefinition = {
  code: string;
  name: string;
  version: string;
  description: string;
  /** Module du cœur : ne peut pas être désactivé. */
  core?: boolean;
  defaultActive?: boolean;
  configSchema?: ZodType<Record<string, unknown>>;
  defaultConfig?: Record<string, unknown>;
  /** Clés de configuration masquées à la lecture. */
  secretConfigKeys?: string[];
  subscribes?: { [N in DomainEventName]?: EventHandler<N> };
  /** Abonnement à tous les événements (ex. webhooks sortants). */
  onAnyEvent?: EventHandler;
  routes?: AnyRoute[];
  /** Migrations SQL propres au module (dans drizzle/, appliquées avec les migrations du cœur). */
  migrations?: string[];
};

let definitions: ModuleDefinition[] = [];
let stateCache: { at: number; rows: Map<string, { isActive: boolean; config: Record<string, unknown> }> } | null = null;
const CACHE_MS = 30_000;

export function registerModules(list: ModuleDefinition[]) {
  const codes = new Set<string>();
  for (const definition of list) {
    if (!/^[a-z][a-z0-9-]{2,59}$/.test(definition.code)) throw new Error(`Code de module invalide : ${definition.code}`);
    if (codes.has(definition.code)) throw new Error(`Module en double : ${definition.code}`);
    codes.add(definition.code);
  }
  definitions = list;
  stateCache = null;
}

export function moduleDefinitions(): ModuleDefinition[] {
  return definitions;
}

export function clearModuleCache() {
  stateCache = null;
}

/** Crée en base les modules livrés mais pas encore installés (idempotent). */
export async function syncModules(database: Db) {
  const rows = await database.select({ code: modulesTable.code }).from(modulesTable);
  const installed = new Set(rows.map((row) => row.code));
  for (const definition of definitions) {
    if (installed.has(definition.code)) continue;
    await database.insert(modulesTable).values({
      code: definition.code, name: definition.name, version: definition.version, description: definition.description,
      isActive: Boolean(definition.core || definition.defaultActive), config: definition.defaultConfig ?? {},
    }).onConflictDoNothing();
  }
  stateCache = null;
}

async function states(database: Db) {
  if (stateCache && Date.now() - stateCache.at < CACHE_MS) return stateCache.rows;
  const rows = await database.select({ code: modulesTable.code, isActive: modulesTable.isActive, config: modulesTable.config }).from(modulesTable);
  stateCache = { at: Date.now(), rows: new Map(rows.map((row) => [row.code, { isActive: row.isActive, config: (row.config ?? {}) as Record<string, unknown> }])) };
  return stateCache.rows;
}

async function subscribersFor(database: Db, name: DomainEventName): Promise<Subscriber[]> {
  const current = await states(database);
  const out: Subscriber[] = [];
  for (const definition of definitions) {
    const state = current.get(definition.code);
    const active = definition.core || state?.isActive;
    if (!active) continue;
    const config = { ...(definition.defaultConfig ?? {}), ...(state?.config ?? {}) };
    const specific = definition.subscribes?.[name] as EventHandler | undefined;
    if (specific) out.push({ moduleCode: definition.code, handler: specific, config });
    if (definition.onAnyEvent) out.push({ moduleCode: definition.code, handler: definition.onAnyEvent, config });
  }
  return out;
}

setSubscriberSource(subscribersFor);

export type ModuleView = {
  code: string; name: string; version: string; description: string; core: boolean; isActive: boolean; installed: boolean;
  config: Record<string, unknown>; events: string[]; routes: string[];
};

function maskConfig(definition: ModuleDefinition, config: Record<string, unknown>): Record<string, unknown> {
  const secrets = new Set(definition.secretConfigKeys ?? []);
  const mask = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(mask);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, secrets.has(key) ? (inner ? "••••••" : "") : mask(inner)]));
    return value;
  };
  return mask(config) as Record<string, unknown>;
}

/**
 * Une configuration relue puis renvoyée contient « •••••• » à la place des secrets :
 * on remet alors la valeur enregistrée au lieu d'écraser le secret par des points.
 */
export function restoreMaskedSecrets(next: unknown, previous: unknown, secrets: ReadonlySet<string>): Record<string, unknown> {
  const walk = (value: unknown, old: unknown): unknown => {
    if (Array.isArray(value)) return value.map((item, index) => walk(item, Array.isArray(old) ? old[index] : undefined));
    if (value && typeof value === "object") {
      const oldRecord = (old && typeof old === "object" ? old : {}) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, inner]) => [key, secrets.has(key) && inner === "••••••" ? oldRecord[key] : walk(inner, oldRecord[key])]));
    }
    return value;
  };
  return walk(next, previous) as Record<string, unknown>;
}

export async function listModules(database: Db): Promise<ModuleView[]> {
  const rows = await database.select().from(modulesTable);
  const byCode = new Map(rows.map((row) => [row.code, row]));
  return definitions.map((definition) => {
    const row = byCode.get(definition.code);
    return {
      code: definition.code, name: definition.name, version: definition.version, description: definition.description,
      core: Boolean(definition.core), installed: Boolean(row), isActive: Boolean(definition.core || row?.isActive),
      config: maskConfig(definition, { ...(definition.defaultConfig ?? {}), ...((row?.config ?? {}) as Record<string, unknown>) }),
      events: [...Object.keys(definition.subscribes ?? {}), ...(definition.onAnyEvent ? ["*"] : [])],
      routes: (definition.routes ?? []).map((route) => `${route.method} /api/v1${route.path}`),
    };
  });
}

export async function updateModule(database: Db, input: { code: string; isActive?: boolean; config?: Record<string, unknown>; actor: AuditActor; meta?: RequestMeta }): Promise<ModuleView> {
  const definition = definitions.find((entry) => entry.code === input.code);
  if (!definition) throw errors.notFound("Module", input.code);
  if (definition.core && input.isActive === false) throw errors.rule("Un module du cœur ne peut pas être désactivé.");
  await syncModules(database);
  let config: Record<string, unknown> | undefined;
  if (input.config) {
    const [current] = await database.select({ config: modulesTable.config }).from(modulesTable).where(eq(modulesTable.code, input.code)).limit(1);
    const schema = definition.configSchema ?? z.record(z.string(), z.unknown());
    const parsed = schema.safeParse(restoreMaskedSecrets(input.config, (current?.config ?? {}) as Record<string, unknown>, new Set(definition.secretConfigKeys ?? [])));
    if (!parsed.success) throw errors.validation(zodIssues(parsed.error.issues).map((issue) => ({ ...issue, path: `config.${issue.path}` })));
    config = parsed.data;
  }
  await database.transaction(async (tx) => {
    const [before] = await tx.select().from(modulesTable).where(eq(modulesTable.code, input.code)).for("update");
    const patch = { ...(input.isActive === undefined ? {} : { isActive: input.isActive }), ...(config ? { config } : {}), updatedAt: new Date() };
    const [after] = await tx.update(modulesTable).set(patch).where(eq(modulesTable.code, input.code)).returning();
    await recordAudit(tx, { action: "module.updated", entityType: "module", entityId: input.code, before: { isActive: before?.isActive, config: before?.config }, after: { isActive: after.isActive, config: after.config }, actor: input.actor, meta: input.meta });
    if (input.isActive !== undefined && input.isActive !== before?.isActive) await emitEvent(tx, input.isActive ? "module.enabled" : "module.disabled", { code: input.code }, { aggregateType: "module", aggregateId: input.code });
    if (config) await emitEvent(tx, "module.configured", { code: input.code }, { aggregateType: "module", aggregateId: input.code });
  });
  stateCache = null;
  const view = (await listModules(database)).find((entry) => entry.code === input.code);
  if (!view) throw errors.notFound("Module", input.code);
  return view;
}
