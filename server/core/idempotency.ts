/**
 * Clés d'idempotence (en-tête `Idempotency-Key`) pour les créations sensibles :
 * commande, paiement, ressources d'administration.
 *
 * - même clé + même requête  → la réponse enregistrée est rejouée (aucun double effet) ;
 * - même clé + autre requête → 422 IDEMPOTENCY_KEY_REUSED ;
 * - même clé encore en cours → 409 IDEMPOTENCY_IN_PROGRESS ;
 * - en cas d'échec, la clé est libérée pour permettre une nouvelle tentative.
 */
import { and, eq, lt } from "drizzle-orm";
import { idempotencyKeys } from "@/lib/db/schema";
import type { Db } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { sha256 } from "@/server/core/auth/tokens";

export const IDEMPOTENCY_TTL_HOURS = 24;
const KEY_PATTERN = /^[A-Za-z0-9_:.-]{8,128}$/;

export type StoredResponse = { status: number; body: unknown };

export function readIdempotencyKey(headers: Headers, required: boolean): string | null {
  const key = headers.get("idempotency-key")?.trim() || null;
  if (!key) {
    if (required) throw errors.badRequest("L'en-tête Idempotency-Key est obligatoire pour cette opération.");
    return null;
  }
  if (!KEY_PATTERN.test(key)) throw errors.badRequest("Idempotency-Key doit faire 8 à 128 caractères (lettres, chiffres, _ : . -).");
  return key;
}

/**
 * Réserve la clé. Renvoie la réponse déjà enregistrée si la même requête a abouti,
 * ou null si le traitement doit être exécuté.
 */
export async function beginIdempotent(database: Db, scope: string, key: string, requestBody: string, now = new Date()): Promise<StoredResponse | null> {
  const requestHash = sha256(requestBody);
  await database.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), lt(idempotencyKeys.expiresAt, now)));
  const inserted = await database.insert(idempotencyKeys).values({
    scope, key, requestHash, status: "processing", expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_HOURS * 3_600_000),
  }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
  if (inserted.length) return null;
  const [existing] = await database.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key))).limit(1);
  if (!existing) return null;
  if (existing.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_KEY_REUSED", "Cette clé d'idempotence a déjà servi pour une requête différente.");
  if (existing.status !== "completed" || existing.responseStatus === null) throw new AppError("IDEMPOTENCY_IN_PROGRESS", "Une requête avec cette clé est déjà en cours de traitement.");
  return { status: existing.responseStatus, body: existing.responseBody };
}

export async function completeIdempotent(database: Db, scope: string, key: string, response: StoredResponse) {
  await database.update(idempotencyKeys).set({ status: "completed", responseStatus: response.status, responseBody: response.body as never })
    .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
}

export async function releaseIdempotent(database: Db, scope: string, key: string) {
  await database.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), eq(idempotencyKeys.status, "processing")));
}
