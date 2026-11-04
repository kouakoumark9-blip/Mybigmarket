/**
 * Journal d'audit : qui, quoi, quand, avant/après.
 *
 * Écrit dans employee_audit_logs (table déjà utilisée par le back-office), dans la même
 * transaction que la modification : une action non journalisée n'est pas enregistrée.
 * Les champs sensibles (hashes, secrets, jetons) ne sont jamais copiés dans le journal.
 */
import { employeeAuditLogs } from "@/lib/db/schema";
import type { Executor } from "@/server/core/db";
import type { AdminPrincipal } from "@/server/core/auth/principal";
import type { RequestMeta } from "@/server/core/http/request-context";

const SENSITIVE_FIELD = /password|hash|secret|token|totp|api_?key|private_?key/i;

export type AuditActor = AdminPrincipal | { kind: "system"; label: string; shopId?: string };

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
  actor: AuditActor;
  meta?: RequestMeta;
  shopId?: string;
};

function serializable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === "object") return sanitize(value as Record<string, unknown>);
  return value;
}

export function sanitize(record: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!record) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) out[key] = SENSITIVE_FIELD.test(key) ? "[masqué]" : serializable(value);
  return out;
}

/** Champs dont la valeur diffère entre l'état avant et l'état après. */
export function changedFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((key) => JSON.stringify(serializable(before?.[key])) !== JSON.stringify(serializable(after?.[key]))).sort();
}

export async function recordAudit(executor: Executor, entry: AuditEntry) {
  const before = sanitize(entry.before);
  const after = sanitize(entry.after);
  const actor = entry.actor;
  await executor.insert(employeeAuditLogs).values({
    actorEmployeeId: actor.kind === "system" ? null : actor.employeeId,
    actorType: actor.kind,
    apiKeyId: actor.kind === "api_key" ? actor.apiKeyId : null,
    shopId: entry.shopId ?? (actor.kind === "system" ? actor.shopId ?? null : actor.shopId),
    action: entry.action.slice(0, 80),
    entityType: entry.entityType.slice(0, 80),
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId).slice(0, 100),
    details: entry.details ? sanitize(entry.details) : null,
    beforeState: before,
    afterState: after,
    changedFields: before || after ? changedFields(before, after) : null,
    ipAddress: entry.meta?.ip ?? null,
    userAgent: entry.meta?.userAgent ?? null,
    requestId: entry.meta?.requestId ?? null,
  });
}
