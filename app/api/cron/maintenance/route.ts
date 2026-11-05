import { runCronTasks } from "@/server/core/cron";
import "@/server/api/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tâches planifiées quotidiennes d'exploitation : statistiques des 7 derniers jours, reprise des
 * imports interrompus, clôture des tickets résolus, nettoyage technique. Protégée par CRON_SECRET.
 */
export function GET(request: Request) {
  return runCronTasks(request, ["stats.refresh", "imports.resume", "support.auto_close", "maintenance.purge"]);
}
