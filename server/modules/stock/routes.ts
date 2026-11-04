import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/stock/service";
import * as v from "@/server/modules/stock/validators";

const tags = ["Stocks"];

export const stockRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.warehouses.list", method: "GET", path: "/admin/warehouses", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Entrepôts (avec totaux physique et réservé)",
    handler: ({ db }) => service.listWarehouses(db),
  }),
  defineRoute({
    id: "admin.warehouses.create", method: "POST", path: "/admin/warehouses", surface: "admin", tags, permission: "catalog.stock.manage",
    summary: "Créer un entrepôt", description: "`isSellable: false` pour un entrepôt de transit (stock non vendable en boutique).", body: v.createWarehouseBody,
    handler: (ctx) => service.createWarehouse(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.warehouses.get", method: "GET", path: "/admin/warehouses/:id", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Détail d'un entrepôt", params: uuidParams,
    handler: ({ db, params }) => service.getWarehouse(db, params.id),
  }),
  defineRoute({
    id: "admin.warehouses.update", method: "PATCH", path: "/admin/warehouses/:id", surface: "admin", tags, permission: "catalog.stock.manage",
    summary: "Modifier un entrepôt", description: "Changer « actif » ou « vendable » recale les compteurs de la boutique dans la même transaction.", params: uuidParams, body: v.updateWarehouseBody,
    handler: (ctx) => service.updateWarehouse(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.warehouses.delete", method: "DELETE", path: "/admin/warehouses/:id", surface: "admin", tags, permission: "catalog.stock.manage",
    summary: "Supprimer un entrepôt vide", params: uuidParams, status: 204,
    handler: async (ctx) => { await service.deleteWarehouse(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),

  defineRoute({
    id: "admin.stock.levels", method: "GET", path: "/admin/stock", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Niveaux de stock par entrepôt", description: "`lowStock=true` : lignes dont le disponible est sous le seuil d'alerte.", list: service.levelListSpec, query: v.levelsQuery,
    handler: ({ db, list, query }) => service.listLevels(db, list, { lowStock: query.lowStock }),
  }),
  defineRoute({
    id: "admin.stock.product", method: "GET", path: "/admin/products/:id/stock", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Stock détaillé d'un produit (entrepôts, déclinaisons, réservations actives)", params: uuidParams,
    handler: ({ db, params }) => service.productStock(db, params.id),
  }),
  defineRoute({
    id: "admin.stock.movements", method: "GET", path: "/admin/stock/movements", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Mouvements de stock (avant/après, motif, auteur, commande)", list: service.movementListSpec,
    handler: ({ db, list }) => service.listMovements(db, list),
  }),
  defineRoute({
    id: "admin.stock.adjust", method: "POST", path: "/admin/stock/adjustments", surface: "admin", tags, permission: "catalog.stock.update",
    summary: "Entrée ou sortie de stock", description: "Motifs : purchase, return, adjustment, loss, restock. Refusé si le disponible deviendrait négatif.", body: v.adjustmentBody, idempotency: "optional",
    handler: (ctx) => service.adjust(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.stock.inventory", method: "POST", path: "/admin/stock/inventory", surface: "admin", tags, permission: "catalog.stock.update",
    summary: "Inventaire : quantités comptées (fixe le stock physique)", body: v.inventoryBody, idempotency: "optional", status: 200,
    handler: (ctx) => service.inventoryCount(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.stock.transfer", method: "POST", path: "/admin/stock/transfers", surface: "admin", tags, permission: "catalog.stock.update",
    summary: "Transfert entre entrepôts", body: v.transferBody, idempotency: "optional",
    handler: (ctx) => service.transfer(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.stock.receipt", method: "POST", path: "/admin/stock/receipts", surface: "admin", tags, permission: "catalog.stock.update",
    summary: "Réception fournisseur (bon de livraison)", description: "Entrée « purchase » de chaque ligne ; le coût unitaire met à jour le prix d'achat chez ce fournisseur.", body: v.receiptBody, idempotency: "optional",
    handler: (ctx) => service.receive(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.stock.reservations", method: "GET", path: "/admin/stock/reservations", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Réservations de stock", list: service.reservationListSpec,
    handler: ({ db, list }) => service.listReservations(db, list),
  }),
  defineRoute({
    id: "admin.stock.reservations.release", method: "POST", path: "/admin/stock/reservations/:id/release", surface: "admin", tags, permission: "catalog.stock.update",
    summary: "Libérer une réservation active", params: uuidParams, status: 200,
    handler: (ctx) => service.releaseReservation(ctx.db, ctx.params.id, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.stock.alerts", method: "GET", path: "/admin/stock/alerts", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Alertes de stock bas (produits et déclinaisons sous le seuil)",
    handler: ({ db }) => service.lowStockAlerts(db),
  }),
  defineRoute({
    id: "admin.stock.replenishment", method: "GET", path: "/admin/stock/replenishment", surface: "admin", tags, permission: "catalog.stock.read",
    summary: "Suggestions de réapprovisionnement par fournisseur", description: "Ventes des N derniers jours, délai d'approvisionnement + 7 jours de sécurité.", query: v.replenishmentQuery,
    handler: ({ db, query }) => service.replenishment(db, query),
  }),
  defineRoute({
    id: "admin.stock.drifts", method: "GET", path: "/admin/stock/drifts", surface: "admin", tags, permission: "catalog.stock.manage",
    summary: "Contrôle d'intégrité : écarts entre compteurs boutique et niveaux de stock",
    handler: ({ db }) => service.drifts(db),
  }),
  defineRoute({
    id: "admin.stock.reconcile", method: "POST", path: "/admin/stock/reconcile", surface: "admin", tags, permission: "catalog.stock.manage",
    summary: "Corriger les écarts (mouvements « inventory » tracés sur l'entrepôt par défaut)", status: 200,
    handler: (ctx) => service.reconcile(ctx.db, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.stock.export", method: "GET", path: "/admin/stock/export.csv", surface: "admin", tags, permission: "catalog.export",
    summary: "Export CSV du stock (séparateur « ; », UTF-8)", query: v.exportQuery,
    handler: async ({ db, query, meta }) => new Response(await service.exportStockCsv(db, query), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="stock-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store", "x-request-id": meta.requestId },
    }),
  }),
  defineRoute({
    id: "admin.stock.import", method: "POST", path: "/admin/stock/import", surface: "admin", tags, permission: "catalog.import",
    summary: "Import CSV du stock (simulation par défaut)", description: "Colonnes : reference|sku|ean13, sku_declinaison, quantite, entrepot. `mode` set (inventaire) ou add (entrée). Hors simulation, tout ou rien.",
    body: v.importBody, status: 200,
    handler: (ctx) => service.importStockCsv(ctx.db, ctx.body, actorContext(ctx)),
  }),
];
