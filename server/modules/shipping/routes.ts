import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { cartItems, orders, DEFAULT_SHOP_ID } from "@/lib/db/schema";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { getSetting } from "@/server/core/settings";
import { actorContext, countryCode, intIdParams, uuidParams } from "@/server/modules/catalog/shared";
import { readCartToken, resolveCart } from "@/server/modules/checkout/cart";
import { quoteCart } from "@/server/modules/checkout/quote";
import * as service from "@/server/modules/shipping/service";

const tags = ["Transport et livraison"];
const shopTags = ["Boutique : livraison"];

const quoteLinesBody = z.array(z.object({ productId: z.string().uuid(), variantId: z.number().int().positive().nullable().optional(), quantity: z.number().int().min(1).max(10_000) }).strict()).min(1).max(100);
const location = { countryCode, regionCode: z.string().trim().max(40).nullable().optional(), city: z.string().trim().max(120).nullable().optional() };

const decimalNumber = z.number().min(0).max(1_000_000);
const methodBody = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,29}$/), mode: z.enum(["air", "sea"]), name: z.string().trim().min(2).max(120),
  isActive: z.boolean().optional(), sampleRatesOnly: z.boolean().optional(), volumetricDivisor: z.number().int().min(1000).max(10_000).optional(),
  minimumBillableWeightKg: decimalNumber.optional(), maximumRecommendedWeightKg: decimalNumber.optional(), seaMinimumVolumeM3: decimalNumber.optional(),
  minimumChargeXof: z.number().int().min(0).optional(), insurancePercent: z.number().min(0).max(100).optional(), customsHandlingXof: z.number().int().min(0).optional(),
  fragileSurchargeXof: z.number().int().min(0).optional(), transitDaysMin: z.number().int().min(0).max(365), transitDaysMax: z.number().int().min(0).max(365),
  configurationNote: z.string().trim().max(2000).optional(), billableBasis: z.enum(["weight", "volume", "both"]).optional(), freeAboveXof: z.number().int().min(0).optional(),
  freeAboveWeightGrams: z.number().int().min(0).optional(), outOfRangeBehavior: z.enum(["disable", "use_highest"]).optional(),
  maxPackageWeightGrams: z.number().int().min(1).optional(), maxPackageLengthCm: z.number().int().min(1).optional(), deliveryTimeLabel: z.string().trim().max(120).optional(),
  trackingUrlPattern: z.union([z.literal(""), z.string().trim().url().max(255).startsWith("https://").includes("{tracking}", { message: "Le motif doit contenir {tracking}." })]).optional(),
}).strict();
const rateBody = z.object({
  minimumBillableUnits: decimalNumber, maximumBillableUnits: decimalNumber.nullable(), rateXofPerUnit: z.number().int().min(0), minimumChargeXof: z.number().int().min(0).optional(),
  label: z.string().trim().max(120).optional(), handlingFeeXof: z.number().int().min(0).optional(), customsFeeXof: z.number().int().min(0).optional(),
  transitDaysMin: z.number().int().min(0).max(365).nullable().optional(), transitDaysMax: z.number().int().min(0).max(365).nullable().optional(),
  validFrom: z.string().datetime({ offset: true }).nullable().optional(), validTo: z.string().datetime({ offset: true }).nullable().optional(), sampleOnly: z.boolean().optional(),
}).strict();
const codes = (pattern: RegExp, max: number) => z.array(z.string().trim().regex(pattern)).max(max);
const zoneBody = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/), name: z.string().trim().min(2).max(120), countryCodes: codes(/^[A-Za-z]{2}$/, 60),
  regionCodes: z.array(z.string().trim().min(1).max(40)).max(100).optional(), cityNames: z.array(z.string().trim().min(1).max(120)).max(200).optional(),
  isActive: z.boolean().optional(), isDefault: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10_000).optional(), notes: z.string().trim().max(2000).optional(),
}).strict();
const pickupBody = z.object({
  name: z.string().trim().min(2).max(160), city: z.string().trim().min(2).max(100), address: z.string().trim().min(4).max(255),
  phone: z.string().trim().max(40).nullable().optional(), openingHours: z.string().trim().max(190).nullable().optional(), isActive: z.boolean().optional(),
}).strict();
const shipmentBody = z.object({
  batchRef: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/).optional(), mode: z.enum(["air", "sea"]).nullable().optional(), carrierName: z.string().trim().max(120).nullable().optional(),
  origin: z.string().trim().min(2).max(120).optional(), destination: z.string().trim().min(2).max(120).optional(), trackingNumber: z.string().trim().max(120).nullable().optional(),
  trackingUrl: z.string().trim().url().max(500).startsWith("https://").nullable().optional(), expectedArrivalAt: z.string().datetime({ offset: true }).nullable().optional(), note: z.string().trim().max(2000).optional(),
}).strict();
const shipmentParams = z.object({ id: z.coerce.number().int().positive(), orderId: z.string().uuid() });

export const shippingRoutes: AnyRoute[] = [
  /* ───────────── Boutique ───────────── */
  defineRoute({
    id: "shop.shipping.quote", method: "POST", path: "/shop/shipping/quote", surface: "shop", tags: shopTags, rateLimit: "shop.cart", status: 200,
    summary: "Devis de transport du panier", description: "Une option par transporteur pour chaque commande (vendeur), et les transporteurs facturables communs avec leur coût cumulé. Sans lignes, le panier de la session est utilisé. Les grilles d'exemple sont signalées `billable: false`.",
    body: z.object({ ...location, lines: quoteLinesBody.optional() }).strict(),
    handler: async (ctx) => {
      const session = await resolveCart(ctx.db, { userId: ctx.customer?.userId ?? null, token: readCartToken(ctx.request), create: false });
      const lines = ctx.body.lines ?? (session.cart ? (await ctx.db.select().from(cartItems).where(eq(cartItems.cartId, session.cart.id)).orderBy(asc(cartItems.createdAt))).map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) : []);
      if (!lines.length) throw errors.rule("Le panier est vide.");
      const cart = await quoteCart(ctx.db, { lines, customer: session.customer, countryCode: ctx.body.countryCode, voucherCodes: session.cart?.voucherCodes ?? [], requireVariant: false });
      const catalog = await service.loadShippingCatalog(ctx.db);
      const groups = [];
      for (const group of cart.sellers) {
        const { quote } = await service.quoteLines(ctx.db, { ...ctx.body, lines: group.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })), subtotalXof: group.totalXof }, catalog);
        groups.push({ sellerId: group.sellerId, totalXof: group.totalXof, quote });
      }
      const quotes = groups.map((group) => group.quote);
      const methods = service.commonBillableMethods(quotes);
      const required = await getSetting(ctx.db, DEFAULT_SHOP_ID, "shipping.require_billable_method");
      return {
        countryCode: ctx.body.countryCode, zone: quotes[0]?.zone ?? null, freeShipping: cart.freeShipping, requiresChoice: required && methods.length > 0,
        methods: methods.map((method) => ({ ...method, totalXof: cart.freeShipping ? 0 : method.totalXof })),
        groups: groups.map(({ sellerId, totalXof, quote }) => ({ sellerId, totalXof, available: quote.available, sampleOnly: quote.sampleOnly, options: quote.options, unavailable: quote.unavailable })),
      };
    },
  }),
  defineRoute({
    id: "shop.pickup_points", method: "GET", path: "/shop/pickup-points", surface: "shop", tags: shopTags,
    summary: "Points relais", query: z.object({ city: z.string().trim().min(2).max(100).optional() }).strict(),
    handler: ({ db, query }) => service.listPickupPoints(db, { city: query.city }),
  }),
  defineRoute({
    id: "shop.orders.tracking", method: "GET", path: "/shop/orders/:id/tracking", surface: "shop", auth: "required", tags: shopTags,
    summary: "Suivi de ma commande", description: "Étapes datées, transporteur, numéro et lien de suivi, lot de groupage et arrivée prévue. Identifiant ou référence.",
    params: z.object({ id: z.string().trim().min(3).max(60) }),
    handler: ({ db, params, customer }) => {
      if (!customer) throw errors.unauthenticated();
      return service.customerOrderTracking(db, customer.userId, params.id);
    },
  }),
  defineRoute({
    id: "shop.tracking.lookup", method: "POST", path: "/shop/tracking", surface: "shop", tags: shopTags, rateLimit: "auth.login", status: 200,
    summary: "Suivi d'une commande sans compte", description: "Référence de commande et e-mail de l'acheteur. Réponse identique si l'un des deux est faux ; nombre d'essais limité.",
    body: z.object({ reference: z.string().trim().min(6).max(40), email: z.string().trim().email().max(190) }).strict(),
    handler: async ({ db, body }) => {
      if (!(await getSetting(db, DEFAULT_SHOP_ID, "shipping.tracking_lookup_enabled"))) throw errors.notFound("Commande");
      return service.guestOrderTracking(db, body);
    },
  }),

  /* ───────────── Administration ───────────── */
  defineRoute({
    id: "admin.shipping.methods.list", method: "GET", path: "/admin/shipping/methods", surface: "admin", tags, permission: "shipping.read",
    summary: "Transporteurs", description: "Avec les zones couvertes et l'indicateur « facturable » (actif, grille réelle).",
    handler: ({ db }) => service.listShippingMethods(db),
  }),
  defineRoute({
    id: "admin.shipping.methods.create", method: "POST", path: "/admin/shipping/methods", surface: "admin", tags, permission: "shipping.create", status: 201,
    summary: "Créer un transporteur", body: methodBody,
    handler: (ctx) => service.createShippingMethod(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipping.methods.get", method: "GET", path: "/admin/shipping/methods/:id", surface: "admin", tags, permission: "shipping.read",
    summary: "Transporteur et ses grilles", params: uuidParams,
    handler: ({ db, params }) => service.getShippingMethod(db, params.id),
  }),
  defineRoute({
    id: "admin.shipping.methods.update", method: "PATCH", path: "/admin/shipping/methods/:id", surface: "admin", tags, permission: "shipping.update",
    summary: "Modifier un transporteur", description: "Une grille ne devient facturable qu'avec `sampleRatesOnly: false` et des tranches réelles.", params: uuidParams, body: methodBody.partial().strict(),
    handler: (ctx) => service.updateShippingMethod(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipping.methods.delete", method: "DELETE", path: "/admin/shipping/methods/:id", surface: "admin", tags, permission: "shipping.delete", status: 204,
    summary: "Supprimer un transporteur (corbeille)", params: uuidParams,
    handler: async (ctx) => { await service.deleteShippingMethod(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.shipping.methods.rates", method: "PUT", path: "/admin/shipping/methods/:id/rates", surface: "admin", tags, permission: "shipping.update",
    summary: "Remplacer la grille d'un transporteur pour une zone", description: "Tranches sans trou ni chevauchement ; seule la dernière peut être ouverte (sans maximum).",
    params: uuidParams, body: z.object({ zoneId: z.string().uuid(), rates: z.array(rateBody).max(50) }).strict(),
    handler: (ctx) => service.replaceRates(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipping.zones.list", method: "GET", path: "/admin/shipping/zones", surface: "admin", tags, permission: "shipping.read",
    summary: "Zones de livraison", handler: ({ db }) => service.listZones(db),
  }),
  defineRoute({
    id: "admin.shipping.zones.create", method: "POST", path: "/admin/shipping/zones", surface: "admin", tags, permission: "shipping.create", status: 201,
    summary: "Créer une zone", description: "Pays, et éventuellement régions ou villes ; une seule zone par défaut.", body: zoneBody,
    handler: (ctx) => service.saveZone(ctx.db, null, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipping.zones.update", method: "PATCH", path: "/admin/shipping/zones/:id", surface: "admin", tags, permission: "shipping.update",
    summary: "Modifier une zone", params: uuidParams, body: zoneBody.partial().strict(),
    handler: (ctx) => service.saveZone(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipping.zones.delete", method: "DELETE", path: "/admin/shipping/zones/:id", surface: "admin", tags, permission: "shipping.delete", status: 204,
    summary: "Supprimer une zone (corbeille)", params: uuidParams,
    handler: async (ctx) => { await service.deleteZone(ctx.db, ctx.params.id, actorContext(ctx)); },
  }),
  defineRoute({
    id: "admin.shipping.quote", method: "POST", path: "/admin/shipping/quote", surface: "admin", tags, permission: "shipping.read", status: 200,
    summary: "Simulateur de devis", description: "Mêmes règles que la boutique, grilles d'exemple comprises (non facturables).",
    body: z.object({ ...location, lines: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(10_000) }).strict()).min(1).max(100), subtotalXof: z.number().int().min(0).optional() }).strict(),
    handler: async ({ db, body }) => {
      const result = await service.quoteLines(db, body);
      if (result.unknown.length) throw errors.rule("Produit introuvable ou non publié.", { productIds: result.unknown });
      return { ...result.quote, subtotalXof: result.subtotalXof };
    },
  }),
  defineRoute({
    id: "admin.pickup_points.list", method: "GET", path: "/admin/pickup-points", surface: "admin", tags, permission: "shipping.read",
    summary: "Points relais", query: z.object({ city: z.string().trim().max(100).optional() }).strict(),
    handler: ({ db, query }) => service.listPickupPoints(db, { city: query.city, includeInactive: true }),
  }),
  defineRoute({
    id: "admin.pickup_points.create", method: "POST", path: "/admin/pickup-points", surface: "admin", tags, permission: "shipping.create", status: 201,
    summary: "Créer un point relais", body: pickupBody,
    handler: (ctx) => service.createPickupPoint(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.pickup_points.update", method: "PATCH", path: "/admin/pickup-points/:id", surface: "admin", tags, permission: "shipping.update",
    summary: "Modifier un point relais", params: intIdParams, body: pickupBody.partial().strict(),
    handler: (ctx) => service.updatePickupPoint(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.pickup_points.delete", method: "DELETE", path: "/admin/pickup-points/:id", surface: "admin", tags, permission: "shipping.delete",
    summary: "Supprimer un point relais", description: "Déjà utilisé par une commande : il est désactivé au lieu d'être supprimé.", params: intIdParams,
    handler: (ctx) => service.deletePickupPoint(ctx.db, ctx.params.id, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.orders.shipping", method: "PUT", path: "/admin/orders/:id/shipping", surface: "admin", tags, permission: "orders.update",
    summary: "Transporteur et suivi d'une commande", description: "Sans lien de suivi, il est construit à partir du motif du transporteur ({tracking}).",
    params: uuidParams, body: z.object({ shippingMethodId: z.string().uuid().nullable().optional(), trackingNumber: z.string().trim().max(120).nullable().optional(), trackingUrl: z.string().trim().url().max(500).startsWith("https://").nullable().optional() }).strict(),
    handler: (ctx) => service.setOrderShipping(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.orders.tracking", method: "GET", path: "/admin/orders/:id/tracking", surface: "admin", tags, permission: "orders.read",
    summary: "Suivi d'une commande", params: uuidParams,
    handler: async ({ db, params }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, params.id)).limit(1);
      if (!order) throw errors.notFound("Commande", params.id);
      return service.orderTracking(db, order, { detailed: true });
    },
  }),
  defineRoute({
    id: "admin.shipments.list", method: "GET", path: "/admin/shipments", surface: "admin", tags, permission: "shipping.read",
    summary: "Lots de groupage", description: "Recherche par référence de lot ou numéro de suivi. Filtres : statut, mode, date.", list: service.shipmentListSpec,
    handler: ({ db, list }) => service.listShipments(db, list),
  }),
  defineRoute({
    id: "admin.shipments.create", method: "POST", path: "/admin/shipments", surface: "admin", tags, permission: "shipping.create", status: 201,
    summary: "Créer un lot de groupage", description: "Référence générée (LOT-AAAAMMJJ-NN) si absente.", body: shipmentBody,
    handler: (ctx) => service.createShipment(ctx.db, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipments.get", method: "GET", path: "/admin/shipments/:id", surface: "admin", tags, permission: "shipping.read",
    summary: "Lot de groupage et ses commandes", params: intIdParams,
    handler: ({ db, params }) => service.getShipment(db, params.id),
  }),
  defineRoute({
    id: "admin.shipments.update", method: "PATCH", path: "/admin/shipments/:id", surface: "admin", tags, permission: "shipping.update",
    summary: "Modifier un lot (transporteur, suivi, arrivée prévue)", params: intIdParams, body: shipmentBody,
    handler: (ctx) => service.updateShipment(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipments.orders.add", method: "POST", path: "/admin/shipments/:id/orders", surface: "admin", tags, permission: "shipping.update", status: 200,
    summary: "Ajouter des commandes à un lot", description: "Commandes confirmées par le vendeur : elles passent « reçue au point de collecte ».",
    params: intIdParams, body: z.object({ orderIds: z.array(z.string().uuid()).min(1).max(500), trackingNumber: z.string().trim().max(120).nullable().optional() }).strict(),
    handler: (ctx) => service.addOrdersToShipment(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipments.orders.remove", method: "DELETE", path: "/admin/shipments/:id/orders/:orderId", surface: "admin", tags, permission: "shipping.update",
    summary: "Retirer une commande d'un lot (avant départ)", params: shipmentParams,
    handler: (ctx) => service.removeOrderFromShipment(ctx.db, ctx.params.id, ctx.params.orderId, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.shipments.status", method: "POST", path: "/admin/shipments/:id/status", surface: "admin", tags, permission: "shipping.update", status: 200,
    summary: "Changer le statut d'un lot", description: "Répercuté sur les commandes : départ → expédiées (stock consommé), arrivée → arrivées à Abidjan.",
    params: intIdParams, body: z.object({ status: z.enum(["draft", "collecting", "shipped", "arrived_abidjan", "closed", "cancelled"]), note: z.string().trim().max(1000).nullable().optional() }).strict(),
    handler: (ctx) => service.changeShipmentStatus(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
];
