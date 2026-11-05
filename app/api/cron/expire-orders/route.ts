import { db } from "@/server/core/db";
import { expireOverduePayments, reconcilePendingIntents } from "@/server/modules/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tâche planifiée quotidienne : rapproche les paiements en attente auprès des prestataires
 * (notifications perdues), puis annule les commandes dont le délai de paiement est dépassé et libère
 * leur stock. Protégée par CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const database = db();
  const reconciled = await reconcilePendingIntents(database, { olderThanMinutes: 10, limit: 100 });
  const expiry = await expireOverduePayments(database, new Date(), 200);
  return Response.json({ ok: true, processed: expiry.expired, ...expiry, pendingChecked: reconciled.length });
}
