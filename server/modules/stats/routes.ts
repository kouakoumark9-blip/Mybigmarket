import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import * as service from "@/server/modules/stats/service";

const tags = ["Statistiques"];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ.");
const rangeQuery = z.object({ from: day.optional(), to: day.optional() }).strict();
const rankingQuery = rangeQuery.extend({ limit: z.coerce.number().int().min(1).max(100).default(10), sort: z.enum(["revenue", "units"]).default("revenue") }).strict();

export const statsRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.stats.overview", method: "GET", path: "/admin/stats/overview", surface: "admin", tags, permission: "analytics.read",
    summary: "Tableau de bord : chiffre d'affaires, commandes, panier moyen, clients, évolution et série quotidienne",
    description: "Période par défaut : les 30 derniers jours (dates UTC = heure d'Abidjan), comparée à la période précédente de même durée. Les jours manquants sont calculés à la lecture ; le jour courant est actualisé toutes les 10 minutes.",
    query: rangeQuery,
    handler: ({ db, query, admin }) => service.statsOverview(db, query, admin.shopId),
  }),
  defineRoute({
    id: "admin.stats.products", method: "GET", path: "/admin/stats/products", surface: "admin", tags, permission: "analytics.read",
    summary: "Meilleures ventes par produit (chiffre d'affaires ou unités)", query: rankingQuery,
    handler: ({ db, query, admin }) => service.bestProducts(db, query, admin.shopId),
  }),
  defineRoute({
    id: "admin.stats.categories", method: "GET", path: "/admin/stats/categories", surface: "admin", tags, permission: "analytics.read",
    summary: "Meilleures catégories", query: rankingQuery,
    handler: ({ db, query, admin }) => service.bestCategories(db, query, admin.shopId),
  }),
  defineRoute({
    id: "admin.stats.sellers", method: "GET", path: "/admin/stats/sellers", surface: "admin", tags, permission: "analytics.read",
    summary: "Meilleurs vendeurs", query: rankingQuery,
    handler: ({ db, query, admin }) => service.bestSellers(db, query, admin.shopId),
  }),
  defineRoute({
    id: "admin.stats.customers", method: "GET", path: "/admin/stats/customers", surface: "admin", tags, permission: "analytics.read",
    summary: "Meilleurs clients (commandes valides)", query: rangeQuery.extend({ limit: z.coerce.number().int().min(1).max(100).default(10) }).strict(),
    handler: ({ db, query }) => service.bestCustomers(db, query),
  }),
  defineRoute({
    id: "admin.stats.daily_csv", method: "GET", path: "/admin/stats/daily.csv", surface: "admin", tags, permission: "analytics.read",
    summary: "Série quotidienne au format CSV", query: rangeQuery,
    handler: async ({ db, query, admin, meta }) => new Response(await service.dailyStatsCsv(db, query, admin.shopId), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="statistiques-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store", "x-request-id": meta.requestId },
    }),
  }),
  defineRoute({
    id: "admin.stats.refresh", method: "POST", path: "/admin/stats/refresh", surface: "admin", tags, permission: "analytics.read", status: 200,
    summary: "Recalculer les statistiques d'une période (400 jours au plus)", body: z.object({ from: day, to: day }).strict(),
    handler: ({ db, body, admin }) => service.refreshDailyStats(db, body, admin.shopId),
  }),
];
