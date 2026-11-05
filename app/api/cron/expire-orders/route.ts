import { runCronTasks } from "@/server/core/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tâche planifiée quotidienne « payments.expire » : rapproche les paiements en attente auprès des
 * prestataires (notifications perdues), puis annule les commandes dont le délai de paiement est
 * dépassé et libère leur stock. Protégée par CRON_SECRET ; historisée (administration → tâches).
 */
export function GET(request: Request) {
  return runCronTasks(request, ["payments.expire"]);
}
