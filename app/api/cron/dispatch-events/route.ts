import { runCronTasks } from "@/server/core/cron";
import "@/server/api/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tâche planifiée « events.dispatch » : distribue les événements métier restés en attente (outbox),
 * puis les envois en file (e-mails, WhatsApp). Filet de sécurité : en temps normal, la
 * distribution a lieu juste après chaque requête. Le registre de l'API charge les abonnés.
 */
export function GET(request: Request) {
  return runCronTasks(request, ["events.dispatch"]);
}
