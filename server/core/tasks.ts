/**
 * Tâches planifiées (étape 7) : un registre de tâches nommées, exécutées par les routes
 * /api/cron/* (Vercel Cron) ou à la demande depuis l'administration.
 *
 * Chaque exécution est historisée (début, fin, durée, résultat ou erreur). Un verrou en base
 * empêche deux exécutions simultanées de la même tâche, même sur deux instances. Une tâche
 * désactivée n'est plus lancée par le planificateur, mais reste exécutable à la main.
 * Un échec entre au journal des erreurs.
 */
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { scheduledTaskRuns, scheduledTasks } from "@/lib/db/schema";
import type { AdminPrincipal } from "@/server/core/auth/principal";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordError } from "@/server/core/error-log";
import { logger, errorContext } from "@/server/core/logger";

export type TaskTrigger = "cron" | "manual";
export type TaskContext = { trigger: TaskTrigger; actor?: AdminPrincipal | null };

export type TaskDefinition = {
  code: string;
  name: string;
  description: string;
  /** Fréquence, en clair (« chaque jour à 00:00 UTC »). */
  schedule: string;
  /** Route de Vercel Cron qui la déclenche. */
  cronPath: string;
  /** Verrou : durée maximale présumée d'une exécution. */
  timeoutSeconds?: number;
  run: (database: Db, context: TaskContext) => Promise<Record<string, unknown>>;
};

const registry = new Map<string, TaskDefinition>();

export function registerTask(definition: TaskDefinition) {
  registry.set(definition.code, definition);
}

export function taskDefinitions(): TaskDefinition[] {
  return [...registry.values()];
}

export function taskDefinition(code: string): TaskDefinition {
  const definition = registry.get(code);
  if (!definition) throw errors.notFound("Tâche planifiée", code);
  return definition;
}

export type TaskRunResult = { code: string; runId: string | null; status: "succeeded" | "failed" | "skipped"; reason?: string; durationMs: number; result?: Record<string, unknown>; error?: string };

export async function runTask(database: Db, code: string, context: TaskContext): Promise<TaskRunResult> {
  const definition = taskDefinition(code);
  await database.insert(scheduledTasks).values({ code }).onConflictDoNothing();
  const [state] = await database.select().from(scheduledTasks).where(eq(scheduledTasks.code, code)).limit(1);
  const triggeredByEmployeeId = context.actor?.employeeId ?? null;

  const skip = async (reason: string): Promise<TaskRunResult> => {
    const [run] = await database.insert(scheduledTaskRuns).values({ taskCode: code, trigger: context.trigger, status: "skipped", finishedAt: new Date(), durationMs: 0, result: { reason }, triggeredByEmployeeId }).returning({ id: scheduledTaskRuns.id });
    return { code, runId: run.id, status: "skipped", reason, durationMs: 0 };
  };
  if (context.trigger === "cron" && state && !state.isEnabled) return skip("Tâche désactivée.");
  const [locked] = await database.update(scheduledTasks)
    .set({ lockedUntil: sql`now() + make_interval(secs => ${definition.timeoutSeconds ?? 300})`, updatedAt: new Date() })
    .where(and(eq(scheduledTasks.code, code), or(isNull(scheduledTasks.lockedUntil), lt(scheduledTasks.lockedUntil, sql`now()`))))
    .returning({ code: scheduledTasks.code });
  if (!locked) return skip("Une exécution est déjà en cours.");

  const started = Date.now();
  const [run] = await database.insert(scheduledTaskRuns).values({ taskCode: code, trigger: context.trigger, status: "running", triggeredByEmployeeId }).returning({ id: scheduledTaskRuns.id });
  try {
    const result = await definition.run(database, context);
    const durationMs = Date.now() - started;
    await database.update(scheduledTaskRuns).set({ status: "succeeded", finishedAt: new Date(), durationMs, result }).where(eq(scheduledTaskRuns.id, run.id));
    await database.update(scheduledTasks).set({ lockedUntil: null, lastRunAt: new Date(started), lastStatus: "succeeded", lastDurationMs: durationMs, lastError: null, updatedAt: new Date() }).where(eq(scheduledTasks.code, code));
    logger.info("task.succeeded", { task: code, trigger: context.trigger, ms: durationMs });
    return { code, runId: run.id, status: "succeeded", durationMs, result };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
    await database.update(scheduledTaskRuns).set({ status: "failed", finishedAt: new Date(), durationMs, error: message }).where(eq(scheduledTaskRuns.id, run.id)).catch(() => undefined);
    await database.update(scheduledTasks).set({ lockedUntil: null, lastRunAt: new Date(started), lastStatus: "failed", lastDurationMs: durationMs, lastError: message, updatedAt: new Date() }).where(eq(scheduledTasks.code, code)).catch(() => undefined);
    logger.error("task.failed", { task: code, trigger: context.trigger, ...errorContext(error) });
    await recordError(database, { source: "task", error, code: "TASK_FAILED", route: code, actor: context.actor?.label ?? context.trigger, context: { runId: run.id, trigger: context.trigger } });
    return { code, runId: run.id, status: "failed", durationMs, error: message };
  }
}

/** Tâches et état courant (dernier passage, verrou, activation). */
export async function listTasks(database: Db) {
  const states = await database.select().from(scheduledTasks);
  const byCode = new Map(states.map((state) => [state.code, state]));
  const now = Date.now();
  return taskDefinitions().map((definition) => {
    const state = byCode.get(definition.code);
    return {
      code: definition.code, name: definition.name, description: definition.description, schedule: definition.schedule, cronPath: definition.cronPath,
      isEnabled: state?.isEnabled ?? true, running: Boolean(state?.lockedUntil && state.lockedUntil.getTime() > now),
      lastRunAt: state?.lastRunAt ?? null, lastStatus: state?.lastStatus ?? null, lastDurationMs: state?.lastDurationMs ?? null, lastError: state?.lastError ?? null,
    };
  });
}

export async function setTaskEnabled(database: Db, code: string, isEnabled: boolean) {
  taskDefinition(code);
  await database.insert(scheduledTasks).values({ code, isEnabled }).onConflictDoUpdate({ target: scheduledTasks.code, set: { isEnabled, updatedAt: new Date() } });
  return (await listTasks(database)).find((task) => task.code === code)!;
}

export async function taskRuns(database: Db, code: string, query: { page: number; limit: number }) {
  taskDefinition(code);
  const rows = await database.select().from(scheduledTaskRuns).where(eq(scheduledTaskRuns.taskCode, code))
    .orderBy(desc(scheduledTaskRuns.startedAt)).limit(query.limit).offset((query.page - 1) * query.limit);
  const [{ value }] = await database.select({ value: sql<number>`count(*)::int` }).from(scheduledTaskRuns).where(eq(scheduledTaskRuns.taskCode, code));
  return { data: rows, meta: { page: query.page, limit: query.limit, total: Number(value), totalPages: Math.max(1, Math.ceil(Number(value) / query.limit)) } };
}
