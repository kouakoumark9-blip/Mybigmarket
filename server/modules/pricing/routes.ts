import { eq } from "drizzle-orm";
import { customers } from "@/lib/db/schema";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import type { Executor } from "@/server/core/db";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import * as service from "@/server/modules/pricing/service";
import * as v from "@/server/modules/pricing/validators";

const tags = ["Prix et promotions"];

/** Client boutique connecté → identifiant du profil client (null si invité). */
export async function customerIdFor(executor: Executor, userId: string | undefined | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await executor.select({ id: customers.id }).from(customers).where(eq(customers.userId, userId)).limit(1);
  return row?.id ?? null;
}

export const pricingRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.products.price", method: "GET", path: "/admin/products/:id/price", surface: "admin", tags, permission: "pricing.read",
    summary: "Simuler le prix d'un produit pour un client", description: "Quantité, déclinaison, client ou groupe, pays et devise : prix HT/TTC, prix barré, règle appliquée, plancher.",
    params: uuidParams, query: v.priceQuery,
    handler: ({ db, params, query }) => service.resolvePrice(db, { productId: params.id, variantId: query.variantId, quantity: query.quantity, customerId: query.customerId, customerGroupId: query.customerGroupId, countryCode: query.country, currency: query.currency })
      .then(({ breakdown, ...price }) => ({ ...price, marginXof: breakdown.marginXof, marginPercent: breakdown.marginPercent })),
  }),
  defineRoute({
    id: "admin.products.price_tiers.set", method: "PUT", path: "/admin/products/:id/price-tiers", surface: "admin", tags, permission: "pricing.update",
    summary: "Prix dégressifs par quantité (remplace l'existant)", description: "Un palier remplace le prix de base, il ne se cumule pas. Les paliers ne doivent pas se chevaucher.",
    params: uuidParams, body: v.priceTiersBody,
    handler: (ctx) => service.setPriceTiers(ctx.db, ctx.params.id, ctx.body.tiers, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.specific_prices.list", method: "GET", path: "/admin/products/:id/specific-prices", surface: "admin", tags, permission: "pricing.read",
    summary: "Prix spécifiques d'un produit", params: uuidParams,
    handler: ({ db, params }) => service.listSpecificPrices(db, params.id),
  }),
  defineRoute({
    id: "admin.specific_prices.create", method: "POST", path: "/admin/products/:id/specific-prices", surface: "admin", tags, permission: "pricing.create",
    summary: "Ajouter un prix spécifique", description: "Prix fixe HT, remise en % ou en montant ; ciblé par déclinaison, client, groupe, pays, devise, quantité minimale et période.",
    params: uuidParams, body: v.createSpecificPriceBody,
    handler: (ctx) => service.createSpecificPrice(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.specific_prices.update", method: "PATCH", path: "/admin/specific-prices/:id", surface: "admin", tags, permission: "pricing.update",
    summary: "Modifier un prix spécifique", params: v.specificPriceParams, body: v.updateSpecificPriceBody,
    handler: (ctx) => service.updateSpecificPrice(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.specific_prices.delete", method: "DELETE", path: "/admin/specific-prices/:id", surface: "admin", tags, permission: "pricing.delete",
    summary: "Supprimer un prix spécifique", params: v.specificPriceParams, status: 204,
    handler: async (ctx) => { await service.deleteSpecificPrice(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),

  defineRoute({
    id: "admin.catalog_rules.list", method: "GET", path: "/admin/catalog-price-rules", surface: "admin", tags, permission: "pricing.read",
    summary: "Règles de prix catalogue (promotions)", list: service.catalogRuleListSpec,
    handler: ({ db, list }) => service.listCatalogRules(db, list),
  }),
  defineRoute({
    id: "admin.catalog_rules.create", method: "POST", path: "/admin/catalog-price-rules", surface: "admin", tags, permission: "pricing.create",
    summary: "Créer une règle de prix catalogue", description: "Conditions cumulatives : catégories, marques, fournisseurs, produits ; exclusions possibles.",
    body: v.createCatalogRuleBody,
    handler: (ctx) => service.createCatalogRule(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.catalog_rules.get", method: "GET", path: "/admin/catalog-price-rules/:id", surface: "admin", tags, permission: "pricing.read",
    summary: "Détail d'une règle (avec nombre de produits visés)", params: uuidParams,
    handler: ({ db, params }) => service.getCatalogRule(db, params.id),
  }),
  defineRoute({
    id: "admin.catalog_rules.update", method: "PATCH", path: "/admin/catalog-price-rules/:id", surface: "admin", tags, permission: "pricing.update",
    summary: "Modifier une règle de prix catalogue", params: uuidParams, body: v.updateCatalogRuleBody,
    handler: (ctx) => service.updateCatalogRule(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.catalog_rules.delete", method: "DELETE", path: "/admin/catalog-price-rules/:id", surface: "admin", tags, permission: "pricing.delete",
    summary: "Supprimer une règle de prix catalogue", params: uuidParams, status: 204,
    handler: async (ctx) => { await service.deleteCatalogRule(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),

  defineRoute({
    id: "admin.vouchers.list", method: "GET", path: "/admin/vouchers", surface: "admin", tags, permission: "pricing.read",
    summary: "Bons de réduction", list: service.voucherListSpec,
    handler: ({ db, list }) => service.listVouchers(db, list),
  }),
  defineRoute({
    id: "admin.vouchers.create", method: "POST", path: "/admin/vouchers", surface: "admin", tags, permission: "pricing.create",
    summary: "Créer un bon de réduction", description: "Sans code fourni, un code unique est généré. Montants en FCFA, appliqués aux prix TTC payés par le client.",
    body: v.createVoucherBody, idempotency: "optional",
    handler: (ctx) => service.createVoucher(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.vouchers.get", method: "GET", path: "/admin/vouchers/:id", surface: "admin", tags, permission: "pricing.read",
    summary: "Détail d'un bon de réduction", params: uuidParams,
    handler: ({ db, params }) => service.getVoucher(db, params.id),
  }),
  defineRoute({
    id: "admin.vouchers.update", method: "PATCH", path: "/admin/vouchers/:id", surface: "admin", tags, permission: "pricing.update",
    summary: "Modifier un bon de réduction", params: uuidParams, body: v.updateVoucherBody,
    handler: (ctx) => service.updateVoucher(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.vouchers.delete", method: "DELETE", path: "/admin/vouchers/:id", surface: "admin", tags, permission: "pricing.delete",
    summary: "Supprimer un bon de réduction (corbeille)", params: uuidParams, status: 204,
    handler: async (ctx) => { await service.deleteVoucher(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.vouchers.simulate", method: "POST", path: "/admin/vouchers/simulate", surface: "admin", tags, permission: "pricing.read",
    summary: "Simuler des bons sur un panier", body: v.voucherCheckBody.extend({ customerId: v.priceQuery.shape.customerId }), status: 200,
    handler: ({ db, body }) => service.checkVouchers(db, body),
  }),

  defineRoute({
    id: "shop.vouchers.check", method: "POST", path: "/shop/vouchers/check", surface: "shop", tags: ["Boutique"],
    summary: "Vérifier des bons de réduction sur un panier", description: "Prix du client connecté (ou invité), motifs de refus explicites. Aucune utilisation n'est enregistrée.",
    body: v.voucherCheckBody, status: 200, rateLimit: "shop.default",
    handler: async ({ db, body, customer }) => service.checkVouchers(db, { ...body, customerId: await customerIdFor(db, customer?.userId) }),
  }),
];
