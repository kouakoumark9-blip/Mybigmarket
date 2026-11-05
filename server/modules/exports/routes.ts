import { z } from "zod";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { productStatuses } from "@/server/modules/catalog/products/validators";
import { actorContext, queryBoolean } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/exports/service";

const tags = ["Import / export"];
const pageParam = z.coerce.number().int().min(1).max(1000).default(1);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date AAAA-MM-JJ.");

/** Fichier CSV paginé : `x-total-count`, `x-page`, `x-total-pages` pour récupérer la suite. */
function csvResponse(result: service.ExportPage, name: string, requestId: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = result.totalPages > 1 ? `-${result.page}-sur-${result.totalPages}` : "";
  return new Response(result.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}-${stamp}${suffix}.csv"`, "cache-control": "no-store",
      "x-request-id": requestId, "x-total-count": String(result.total), "x-page": String(result.page), "x-total-pages": String(result.totalPages),
      "access-control-expose-headers": "x-total-count, x-page, x-total-pages, content-disposition",
    },
  });
}

export const exportRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.exports.products", method: "GET", path: "/admin/exports/products.csv", surface: "admin", tags, permission: "catalog.export",
    summary: "Export des produits (mêmes colonnes que l'import)", description: "5 000 lignes par page (`page`). `withStock=1` ajoute la colonne quantite (ignorée à la réimport d'un produit existant).",
    query: z.object({ status: z.enum(productStatuses).optional(), categoryId: z.coerce.number().int().positive().optional(), sellerId: z.string().uuid().optional(), withStock: queryBoolean.optional(), page: pageParam }).strict(),
    handler: async ({ db, query, meta }) => csvResponse(await service.exportProducts(db, query), "produits", meta.requestId),
  }),
  defineRoute({
    id: "admin.exports.categories", method: "GET", path: "/admin/exports/categories.csv", surface: "admin", tags, permission: "catalog.export",
    summary: "Export des catégories (parents avant enfants, réimportable)",
    handler: async ({ db, meta }) => csvResponse(await service.exportCategories(db), "categories", meta.requestId),
  }),
  defineRoute({
    id: "admin.exports.brands", method: "GET", path: "/admin/exports/brands.csv", surface: "admin", tags, permission: "catalog.export",
    summary: "Export des marques (réimportable)",
    handler: async ({ db, meta }) => csvResponse(await service.exportBrands(db), "marques", meta.requestId),
  }),
  defineRoute({
    id: "admin.exports.customers", method: "GET", path: "/admin/exports/customers.csv", surface: "admin", tags, permission: "customers.export",
    summary: "Export des clients (données personnelles : export journalisé)", description: "Clients anonymisés ou à la corbeille exclus. Consentements newsletter et offres commerciales inclus.",
    query: z.object({ groupId: z.coerce.number().int().positive().optional(), segment: z.enum(["individual", "business", "reseller"]).optional(), page: pageParam }).strict(),
    handler: async (ctx) => csvResponse(await service.exportCustomers(ctx.db, ctx.query, actorContext(ctx)), "clients", ctx.meta.requestId),
  }),
  defineRoute({
    id: "admin.exports.orders", method: "GET", path: "/admin/exports/orders.csv", surface: "admin", tags, permission: "orders.export",
    summary: "Export des commandes (export journalisé)", query: z.object({ from: isoDay.optional(), to: isoDay.optional(), status: z.string().regex(/^[a-z_]{2,40}$/).optional(), page: pageParam }).strict(),
    handler: async (ctx) => csvResponse(await service.exportOrders(ctx.db, ctx.query, actorContext(ctx)), "commandes", ctx.meta.requestId),
  }),
];
