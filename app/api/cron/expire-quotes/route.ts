import { runCronTasks } from "@/server/core/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tâche planifiée « shipping.purge_quotes » : purge par lots des devis de transport expirés.
 *
 * Cadence quotidienne : l'offre Vercel Hobby n'autorise qu'une exécution par jour ; une fréquence
 * plus fine fait échouer le déploiement. Un devis expiré qui attend la purge suivante n'a aucun
 * effet côté client.
 */
export function GET(request: Request) {
  return runCronTasks(request, ["shipping.purge_quotes"]);
}
