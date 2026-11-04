import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { invoices, orders } from "@/lib/db/schema";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/orders/service";

const tags = ["Commandes"];
const html = (body: string, requestId: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-request-id": requestId, "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } });

export const orderRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.orders.list", method: "GET", path: "/admin/orders", surface: "admin", tags, permission: "orders.read",
    summary: "Commandes", description: "Recherche par référence ou acheteur (nom, e-mail). Filtres : statut, client, regroupement de paiement, date, montant.", list: service.orderListSpec,
    handler: ({ db, list }) => service.listOrders(db, list),
  }),
  defineRoute({
    id: "admin.orders.get", method: "GET", path: "/admin/orders/:id", surface: "admin", tags, permission: "orders.read",
    summary: "Détail d'une commande", description: "Lignes figées, paiements, historique, factures, avoirs, réservations de stock, séquestre et statuts possibles.", params: uuidParams,
    handler: ({ db, params }) => service.getOrder(db, params.id),
  }),
  defineRoute({
    id: "admin.orders.status", method: "POST", path: "/admin/orders/:id/status", surface: "admin", tags, permission: "orders.status.update",
    summary: "Changer le statut d'une commande", description: "Parcours strict ; effets sur le stock, le paiement et le séquestre dans la même transaction. `version` facultatif (verrou optimiste).",
    params: uuidParams, status: 200,
    body: z.object({ status: z.enum(service.ORDER_STATUS_VALUES), note: z.string().trim().max(1000).nullable().optional(), trackingNumber: z.string().trim().max(120).nullable().optional(), version: z.number().int().min(0).optional() }).strict(),
    handler: (ctx) => service.changeStatus(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.orders.note", method: "PATCH", path: "/admin/orders/:id/note", surface: "admin", tags, permission: "orders.update",
    summary: "Note interne de la commande", params: uuidParams, body: z.object({ note: z.string().trim().max(5000) }).strict(),
    handler: (ctx) => service.updateNote(ctx.db, ctx.params.id, ctx.body.note, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.orders.invoice", method: "POST", path: "/admin/orders/:id/invoice", surface: "admin", tags, permission: "orders.documents.manage",
    summary: "Émettre la facture (numéro séquentiel sans trou)", params: uuidParams,
    handler: (ctx) => service.issueInvoice(ctx.db, ctx.params.id, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.orders.credit_note", method: "POST", path: "/admin/orders/:id/credit-notes", surface: "admin", tags, permission: "orders.documents.manage",
    summary: "Créer un avoir (dans la limite de la facture)", params: uuidParams, body: z.object({ amountXof: z.number().int().min(1), reason: z.string().trim().min(3).max(500) }).strict(),
    handler: (ctx) => service.createCreditNote(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.invoices.document", method: "GET", path: "/admin/invoices/:id/document", surface: "admin", tags, permission: "orders.read",
    summary: "Facture imprimable (HTML A4)", params: uuidParams,
    handler: async ({ db, params, meta }) => html(await service.invoiceDocument(db, params.id), meta.requestId),
  }),
  defineRoute({
    id: "shop.orders.invoice", method: "GET", path: "/shop/orders/:id/invoice", surface: "shop", auth: "required", tags: ["Boutique : compte client"],
    summary: "Ma facture (HTML imprimable)", params: uuidParams,
    handler: async ({ db, params, customer, meta }) => {
      if (!customer) throw errors.unauthenticated();
      const [invoice] = await db.select({ id: invoices.id }).from(invoices).innerJoin(orders, eq(orders.id, invoices.orderId)).where(and(eq(invoices.orderId, params.id), eq(orders.buyerId, customer.userId), eq(invoices.status, "issued"))).limit(1);
      if (!invoice) throw errors.notFound("Facture");
      return html(await service.invoiceDocument(db, invoice.id, { buyerId: customer.userId }), meta.requestId);
    },
  }),
];
