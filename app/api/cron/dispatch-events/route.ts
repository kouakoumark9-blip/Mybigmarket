/**
 * Tâche planifiée : distribue les événements métier restés en attente (outbox).
 * Filet de sécurité : en temps normal, la distribution a lieu juste après chaque requête.
 */
import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/core/db";
import { dispatchPendingEvents, runAfterDispatchHooks } from "@/server/core/events";
import "@/server/api/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return Boolean(secret) && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Non autorisé." } }, { status: 401 });
  const result = await dispatchPendingEvents(db(), { limit: 500 });
  // Puis les traitements abonnés (envoi des e-mails et messages WhatsApp mis en file).
  await runAfterDispatchHooks(db());
  return Response.json({ data: result }, { headers: { "cache-control": "no-store" } });
}
