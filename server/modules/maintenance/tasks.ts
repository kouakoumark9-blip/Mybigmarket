/**
 * Tâches planifiées de la plateforme. Les heures sont en UTC (heure d'Abidjan). Sur l'offre
 * Vercel Hobby, une tâche ne peut tourner qu'une fois par jour : les traitements urgents
 * (envoi des e-mails, suite d'un import) ont lieu juste après chaque requête, la tâche
 * planifiée n'étant qu'un filet de sécurité.
 */
import { dispatchPendingEvents, runAfterDispatchHooks } from "@/server/core/events";
import { registerTask } from "@/server/core/tasks";
import { resumePendingImports } from "@/server/modules/imports/service";
import { purgeExpiredShippingQuotes, purgeTechnicalData } from "@/server/modules/maintenance/service";
import { expireOverduePayments, reconcilePendingIntents } from "@/server/modules/payments/service";
import { isoDay, refreshDailyStats } from "@/server/modules/stats/service";
import { autoCloseResolvedTickets } from "@/server/modules/support/service";
import { expireProposals } from "@/server/modules/ai/service";

registerTask({
  code: "payments.expire", name: "Paiements en attente", cronPath: "/api/cron/expire-orders", schedule: "Chaque jour à 00:00 UTC",
  description: "Vérifie auprès des prestataires les paiements restés en attente (notification perdue), puis annule les commandes dont le délai de paiement est dépassé et libère leur stock.",
  run: async (database) => {
    const reconciled = await reconcilePendingIntents(database, { olderThanMinutes: 10, limit: 100 });
    const expiry = await expireOverduePayments(database, new Date(), 200);
    return { pendingChecked: reconciled.length, ...expiry };
  },
});

registerTask({
  code: "shipping.purge_quotes", name: "Devis de transport expirés", cronPath: "/api/cron/expire-quotes", schedule: "Chaque jour à 01:00 UTC",
  description: "Supprime par lots les devis de transport expirés (conservés 30 minutes pour prouver le prix annoncé).",
  run: (database) => purgeExpiredShippingQuotes(database),
});

registerTask({
  code: "events.dispatch", name: "Événements et envois en attente", cronPath: "/api/cron/dispatch-events", schedule: "Chaque jour à 02:30 UTC",
  description: "Distribue les événements métier restés en attente et envoie les e-mails et messages WhatsApp en file. En temps normal, cela a lieu juste après chaque requête.",
  timeoutSeconds: 600,
  run: async (database) => {
    const result = await dispatchPendingEvents(database, { limit: 500 });
    await runAfterDispatchHooks(database);
    return result;
  },
});

registerTask({
  code: "stats.refresh", name: "Statistiques quotidiennes", cronPath: "/api/cron/maintenance", schedule: "Chaque jour à 03:40 UTC",
  description: "Recalcule les statistiques des 7 derniers jours (paiements, annulations et remboursements tardifs compris).",
  run: async (database) => {
    const to = isoDay(new Date());
    const from = isoDay(new Date(Date.now() - 6 * 86_400_000));
    return refreshDailyStats(database, { from, to });
  },
});

registerTask({
  code: "imports.resume", name: "Reprise des imports", cronPath: "/api/cron/maintenance", schedule: "Chaque jour à 03:40 UTC",
  description: "Reprend les imports CSV interrompus (fermeture de l'onglet, coupure) là où ils se sont arrêtés.",
  run: (database) => resumePendingImports(database, { budgetMs: 45_000 }),
});

registerTask({
  code: "maintenance.purge", name: "Nettoyage technique", cronPath: "/api/cron/maintenance", schedule: "Chaque jour à 03:40 UTC",
  description: "Supprime les données techniques expirées : compteurs de débit, clés d'idempotence, historique des tâches (90 jours), rapports d'import (90 jours), erreurs résolues (90 jours) ou anciennes (180 jours).",
  run: (database) => purgeTechnicalData(database),
});

registerTask({
  code: "support.auto_close", name: "Clôture des tickets résolus", cronPath: "/api/cron/maintenance", schedule: "Chaque jour à 03:40 UTC",
  description: "Clôture les tickets du service client résolus depuis plus de N jours (paramètre « support.auto_close_days », 7 par défaut).",
  run: (database) => autoCloseResolvedTickets(database),
});

registerTask({
  code: "ai.expire_proposals", name: "Propositions IA expirées", cronPath: "/api/cron/maintenance", schedule: "Chaque jour à 03:40 UTC",
  description: "Marque expirées les propositions de l'assistant IA non décidées dans le délai (paramètre « ai.proposal_ttl_hours »).",
  run: (database) => expireProposals(database),
});
