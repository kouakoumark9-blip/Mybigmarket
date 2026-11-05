import { z } from "zod";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/types";
import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { countryCode } from "@/server/modules/catalog/shared";
import { actorContext, uuidParams } from "@/server/modules/catalog/shared";
import { cartView, readCartToken, resolveCart } from "@/server/modules/checkout/cart";
import { ensureCustomer } from "@/server/modules/checkout/customers";
import * as service from "@/server/modules/payments/service";

const tags = ["Paiements"];
const shopTags = ["Boutique : paiement"];
const method = z.enum(PAYMENT_METHOD_CODES);
const idOrReference = z.object({ id: z.string().trim().min(6).max(60) });
const codeParams = z.object({ code: method });

export const paymentRoutes: AnyRoute[] = [
  /* ───────────── Boutique ───────────── */
  defineRoute({
    id: "shop.payment_methods", method: "GET", path: "/shop/payment-methods", surface: "shop", tags: shopTags, rateLimit: "shop.cart",
    summary: "Moyens de paiement proposés", description: "Selon le pays de livraison, le montant (celui du panier par défaut) et le groupe du client connecté. Seuls les moyens disponibles sont renvoyés.",
    query: z.object({ country: countryCode, amount: z.coerce.number().int().min(0).max(1_000_000_000).optional() }).strict(),
    handler: async (ctx) => {
      let amountXof = ctx.query.amount;
      if (amountXof === undefined) {
        const session = await resolveCart(ctx.db, { userId: ctx.customer?.userId ?? null, token: readCartToken(ctx.request), create: false });
        const view = session.cart ? await cartView(ctx.db, session, { countryCode: ctx.query.country }) : null;
        amountXof = (view as { totals?: { totalXof?: number } } | null)?.totals?.totalXof ?? 0;
      }
      const groups = ctx.customer ? (await ensureCustomer(ctx.db, ctx.customer.userId)).groupIds : [];
      const settings = await service.loadPaymentSettings(ctx.db);
      const availability = await service.paymentMethodAvailability(ctx.db, settings, { countryCode: ctx.query.country, amountXof, customerGroupIds: groups });
      return { amountXof, countryCode: ctx.query.country, methods: availability.filter((entry) => entry.available).map(({ code, label, kind }) => ({ code, label, kind })) };
    },
  }),
  defineRoute({
    id: "shop.payments.get", method: "GET", path: "/shop/payments/:id", surface: "shop", auth: "required", tags: shopTags,
    summary: "État d'un paiement (page de retour)", description: "Par référence. Si le paiement est en attente chez un prestataire, son état est vérifié auprès de lui avant la réponse.",
    params: idOrReference,
    handler: async ({ db, params, customer }) => {
      if (!customer) throw errors.unauthenticated();
      return service.getIntentForCustomer(db, customer.userId, params.id);
    },
  }),
  defineRoute({
    id: "shop.orders.pay", method: "POST", path: "/shop/orders/:id/pay", surface: "shop", auth: "required", tags: shopTags, idempotency: "required", rateLimit: "shop.cart", status: 200,
    summary: "Payer (ou repayer) une commande en attente", description: "Nouvelle tentative, éventuellement avec un autre moyen, pour toutes les commandes encore impayées du même passage en caisse. Les paiements en attente sur ces commandes sont annulés.",
    params: uuidParams, body: z.object({ method }).strict(),
    handler: async ({ db, params, body, customer }) => {
      if (!customer) throw errors.unauthenticated();
      const groups = (await ensureCustomer(db, customer.userId)).groupIds;
      return service.retryPayment(db, customer.userId, { orderId: params.id, method: body.method, customerGroupIds: groups });
    },
  }),

  /* ───────────── Administration ───────────── */
  defineRoute({
    id: "admin.payments.list", method: "GET", path: "/admin/payments", surface: "admin", tags, permission: "payments.read",
    summary: "Paiements", description: "Recherche par référence (la nôtre ou celle du prestataire). Filtres : statut, moyen, prestataire, date, montant.", list: service.intentListSpec,
    handler: ({ db, list }) => service.listIntents(db, list),
  }),
  defineRoute({
    id: "admin.payments.reconcile_pending", method: "POST", path: "/admin/payments/reconcile", surface: "admin", tags, permission: "payments.update", status: 200,
    summary: "Rapprocher les paiements en attente", description: "Vérifie auprès des prestataires les paiements en attente depuis plus de N minutes (notifications perdues).",
    body: z.object({ olderThanMinutes: z.number().int().min(1).max(10_080).optional(), limit: z.number().int().min(1).max(200).optional() }).strict(),
    handler: ({ db, body }) => service.reconcilePendingIntents(db, body),
  }),
  defineRoute({
    id: "admin.payments.get", method: "GET", path: "/admin/payments/:id", surface: "admin", tags, permission: "payments.read",
    summary: "Détail d'un paiement", description: "Commandes réglées, journal des transactions et notifications reçues. Identifiant ou référence.", params: idOrReference,
    handler: ({ db, params }) => service.getIntent(db, params.id),
  }),
  defineRoute({
    id: "admin.payments.confirm", method: "POST", path: "/admin/payments/:id/confirm", surface: "admin", tags, permission: "payments.update", status: 200,
    summary: "Confirmer un encaissement manuel", description: "Virement reçu ou espèces encaissées à la livraison. Le montant reçu doit être exactement le montant attendu.",
    params: idOrReference, body: z.object({ amountXof: z.number().int().min(1).optional(), providerReference: z.string().trim().max(190).nullable().optional(), note: z.string().trim().max(500).nullable().optional() }).strict(),
    handler: (ctx) => service.confirmIntentManually(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.payments.reconcile", method: "POST", path: "/admin/payments/:id/reconcile", surface: "admin", tags, permission: "payments.update", status: 200,
    summary: "Vérifier un paiement auprès du prestataire", params: idOrReference,
    handler: async (ctx) => service.reconcileIntent(ctx.db, ctx.params.id, { kind: "reconcile", actorType: "employee", actorId: ctx.admin.employeeId ?? ctx.admin.actorId }),
  }),
  defineRoute({
    id: "admin.payments.cancel", method: "POST", path: "/admin/payments/:id/cancel", surface: "admin", tags, permission: "payments.update", status: 200,
    summary: "Annuler un paiement en attente", description: "Les commandes restent payables jusqu'à leur délai (le client peut relancer un paiement).",
    params: idOrReference, body: z.object({ reason: z.string().trim().min(3).max(240) }).strict(),
    handler: (ctx) => service.cancelIntentByAdmin(ctx.db, ctx.params.id, ctx.body.reason, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.payment_webhooks.list", method: "GET", path: "/admin/payment-notifications", surface: "admin", tags, permission: "payments.read",
    summary: "Notifications de paiement reçues", description: "Boîte de réception des webhooks : traitées, rejetées (signature invalide), ignorées, en échec.", list: service.webhookListSpec,
    handler: ({ db, list }) => service.listWebhookEvents(db, list),
  }),
  defineRoute({
    id: "admin.payment_methods.list", method: "GET", path: "/admin/payment-methods", surface: "admin", tags, permission: "payments.read",
    summary: "Moyens de paiement", description: "Activation, prestataire configuré, règles par pays et disponibilité (exemple : Côte d'Ivoire, 10 000 FCFA).",
    handler: ({ db }) => service.listPaymentMethodConfigs(db),
  }),
  defineRoute({
    id: "admin.payment_methods.update", method: "PATCH", path: "/admin/payment-methods/:code", surface: "admin", tags, permission: "payments.manage",
    summary: "Activer, renommer un moyen de paiement", params: codeParams,
    body: z.object({ isActive: z.boolean().optional(), name: z.string().trim().min(2).max(100).optional(), mode: z.enum(["test", "live"]).optional() }).strict(),
    handler: (ctx) => service.updatePaymentMethod(ctx.db, ctx.params.code, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.payment_methods.countries", method: "PUT", path: "/admin/payment-methods/:code/countries", surface: "admin", tags, permission: "payments.manage",
    summary: "Règles par pays d'un moyen de paiement", description: "Remplace la liste. Vide : proposé dans tous les pays desservis. Sinon, seuls les pays autorisés, avec montants minimum et maximum.",
    params: codeParams,
    body: z.object({ rules: z.array(z.object({ countryCode, isAllowed: z.boolean(), minimumAmountXof: z.number().int().min(0).optional(), maximumAmountXof: z.number().int().min(1).nullable().optional() }).strict()).max(60) }).strict(),
    handler: (ctx) => service.setPaymentCountryRules(ctx.db, ctx.params.code, ctx.body.rules, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.refunds.list", method: "GET", path: "/admin/refunds", surface: "admin", tags, permission: "payments.read",
    summary: "Remboursements", list: service.refundListSpec,
    handler: ({ db, list }) => service.listRefunds(db, list),
  }),
  defineRoute({
    id: "admin.orders.refund", method: "POST", path: "/admin/orders/:id/refunds", surface: "admin", tags, permission: "orders.refund", status: 201,
    summary: "Rembourser une commande", description: "Jamais plus que l'encaissé. Avoir émis si la commande est facturée. Transmis au prestataire s'il rembourse par API, sinon à confirmer après versement.",
    params: uuidParams,
    body: z.object({ amountXof: z.number().int().min(1), reason: z.string().trim().min(5).max(300), method: z.enum(["original", "manual"]).optional(), closeOrder: z.boolean().optional() }).strict(),
    handler: (ctx) => service.createRefund(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.refunds.complete", method: "POST", path: "/admin/refunds/:id/complete", surface: "admin", tags, permission: "orders.refund", status: 200,
    summary: "Confirmer qu'un remboursement a été versé", params: uuidParams,
    body: z.object({ providerReference: z.string().trim().max(190).nullable().optional(), note: z.string().trim().max(500).nullable().optional() }).strict(),
    handler: (ctx) => service.completeRefund(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
  defineRoute({
    id: "admin.refunds.fail", method: "POST", path: "/admin/refunds/:id/fail", surface: "admin", tags, permission: "orders.refund", status: 200,
    summary: "Déclarer un remboursement en échec", params: uuidParams, body: z.object({ reason: z.string().trim().min(3).max(300) }).strict(),
    handler: (ctx) => service.failRefund(ctx.db, ctx.params.id, ctx.body, actorContext(ctx)),
  }),
];
