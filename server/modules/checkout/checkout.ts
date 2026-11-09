/**
 * Passage de commande : recalcule le panier avec le calcul unique (quote.ts), puis, dans UNE
 * transaction :
 *   - consomme les bons (limite globale vérifiée de façon atomique) ;
 *   - crée une commande par vendeur (référence séquentielle, lignes figées : titre, SKU, prix HT,
 *     taux de taxe, remise, total TTC) ;
 *   - réserve le stock (déclinaisons et composants de pack compris) via le grand livre ;
 *   - initialise le paiement, l'historique de statut et l'événement order.created.
 * Si une étape échoue, rien n'est créé. Le délai de paiement libère la réservation à expiration.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { reserveOrderStock, StockLedgerError, type StockLine } from "@/lib/stock-ledger";
import { nextDocumentNumber } from "@/lib/document-numbers";
import type { PaymentMethodCode } from "@/lib/payments/types";
import { countryName, destinationByCode, allDestinationCountries } from "@/lib/west-africa";
import {
  carts, customerAddresses, orderEvents, orderItems, orderStatusHistory, orders, packItems, pickupPoints, products, promoCodeRedemptions, promoCodes, DEFAULT_SHOP_ID,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { emitEvent } from "@/server/core/events";
import { getSetting } from "@/server/core/settings";
import { createIntent, initiateIntent, loadPaymentSettings, paymentDeadline, paymentMethodAvailability } from "@/server/modules/payments/service";
import { planShipping } from "@/server/modules/shipping/service";
import { ensureCustomer, type CustomerContext } from "@/server/modules/checkout/customers";
import { publicLine, quoteCart, type QuoteLineInput, type QuotedLine } from "@/server/modules/checkout/quote";

export type DeliveryInput = {
  method: "delivery" | "pickup";
  countryCode: string;
  language: "fr" | "en" | "pt" | "ar";
  addressId?: string | null;
  address?: { name: string; phone: string; address: string; city: string } | null;
  pickupPointId?: number | null;
  /** Transporteur choisi (code). Sans choix : transport à confirmer, sauf si un transporteur facturable est exigé. */
  shippingMethodCode?: string | null;
};

export type PlaceOrderInput = { userId: string; lines: QuoteLineInput[]; voucherCodes?: string[]; delivery: DeliveryInput; paymentMethod: PaymentMethodCode; cartId?: string | null; requireVariant?: boolean };

let schemaReady = false;

/**
 * Les schémas des étapes 4 et 5 (migrations 0016 et 0017) sont-ils en place ? Mémorisé une fois vrai.
 * Sinon la boutique garde son parcours historique : un déploiement avant migration ne casse rien.
 */
export async function checkoutSchemaReady(executor: Executor): Promise<boolean> {
  if (schemaReady) return true;
  const result = await executor.execute(sql`select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'checkout_group_id')
    and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payment_intents') as ready`);
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{ ready: boolean }>;
  schemaReady = Boolean(rows[0]?.ready);
  return schemaReady;
}

async function deliverySnapshot(executor: Executor, customer: CustomerContext, delivery: DeliveryInput): Promise<{ address: Record<string, string>; pickupPointId: number | null }> {
  if (!allDestinationCountries.some((country) => country.code === delivery.countryCode)) throw errors.validation([{ path: "delivery.countryCode", message: "Pays de livraison non desservi." }]);
  const destination = destinationByCode(delivery.countryCode);
  if (!(destination.languageOptions || [destination.language]).includes(delivery.language)) throw errors.validation([{ path: "delivery.language", message: "Langue non proposée pour cette destination." }]);
  const common = { countryCode: delivery.countryCode, countryName: countryName(delivery.countryCode, "fr"), currency: destination.currency, language: delivery.language };
  if (delivery.method === "pickup") {
    if (delivery.countryCode !== "CI") throw errors.validation([{ path: "delivery.method", message: "Le point relais est proposé uniquement en Côte d'Ivoire." }]);
    if (!delivery.pickupPointId) throw errors.validation([{ path: "delivery.pickupPointId", message: "Choisissez un point relais." }]);
    const [point] = await executor.select({ id: pickupPoints.id, city: pickupPoints.city, name: pickupPoints.name }).from(pickupPoints).where(and(eq(pickupPoints.id, delivery.pickupPointId), eq(pickupPoints.isActive, true))).limit(1);
    if (!point) throw errors.validation([{ path: "delivery.pickupPointId", message: "Ce point relais n'est plus disponible." }]);
    return { address: { ...common, city: point.city, pickupPointName: point.name }, pickupPointId: point.id };
  }
  if (delivery.addressId) {
    const [address] = await executor.select().from(customerAddresses).where(and(eq(customerAddresses.id, delivery.addressId), eq(customerAddresses.customerId, customer.customerId), isNull(customerAddresses.deletedAt))).limit(1);
    if (!address) throw errors.validation([{ path: "delivery.addressId", message: "Adresse introuvable." }]);
    if (address.countryCode !== delivery.countryCode) throw errors.validation([{ path: "delivery.addressId", message: "L'adresse ne correspond pas au pays de livraison choisi." }]);
    return { address: { ...common, name: `${address.firstName} ${address.lastName}`.trim(), phone: address.phone, address: [address.line1, address.line2].filter(Boolean).join(", "), city: address.city }, pickupPointId: null };
  }
  const given = delivery.address;
  if (!given?.name?.trim() || !given.phone?.trim() || !given.address?.trim() || !given.city?.trim()) throw errors.validation([{ path: "delivery.address", message: "Renseignez le nom, le téléphone, la ville et l'adresse complète." }]);
  return { address: { ...common, name: given.name.trim(), phone: given.phone.trim(), address: given.address.trim(), city: given.city.trim() }, pickupPointId: null };
}

/** Lignes de stock à réserver : les packs réservent leurs composants, les produits virtuels rien. */
async function stockLinesFor(executor: Executor, lines: QuotedLine[]): Promise<StockLine[]> {
  const ids = [...new Set(lines.map((line) => line.productId))];
  const types = await executor.select({ id: products.id, productType: products.productType }).from(products).where(inArray(products.id, ids));
  const packIds = types.filter((row) => row.productType === "pack").map((row) => row.id);
  const components = packIds.length ? await executor.select().from(packItems).where(inArray(packItems.packProductId, packIds)) : [];
  const out: StockLine[] = [];
  for (const line of lines) {
    const type = types.find((row) => row.id === line.productId)?.productType;
    if (type === "virtual") continue;
    if (type === "pack") {
      for (const component of components.filter((entry) => entry.packProductId === line.productId)) {
        out.push({ productId: component.componentProductId, variantId: component.componentVariantId, quantity: component.quantity * line.quantity });
      }
      continue;
    }
    out.push({ productId: line.productId, variantId: line.variantId, quantity: line.quantity });
  }
  return out;
}

export async function placeOrder(database: Db, input: PlaceOrderInput) {
  const customer = await ensureCustomer(database, input.userId);
  const delivery = await deliverySnapshot(database, customer, input.delivery);
  const paymentSettings = await loadPaymentSettings(database);
  const requireBillableShipping = await getSetting(database, DEFAULT_SHOP_ID, "shipping.require_billable_method");

  const result = await database.transaction(async (tx) => {
    const quote = await quoteCart(tx, { lines: input.lines, customer, countryCode: input.delivery.countryCode, voucherCodes: input.voucherCodes, requireVariant: input.requireVariant });
    if (!quote.lines.length) throw errors.rule("Le panier est vide.");
    const issues = quote.lines.filter((line) => line.issue).map((line) => ({ productId: line.productId, variantId: line.variantId, title: line.title, ...line.issue! }));
    if (issues.length) throw errors.rule("Certains articles ne peuvent pas être commandés en l'état : mettez le panier à jour.", { issues });
    const rejected = quote.vouchers.rejected.filter((entry) => entry.reason !== "not_combinable");
    if (rejected.length) throw errors.rule(rejected[0].message, { vouchers: rejected });

    // Transport : un coût par commande (vendeur), transporteur facturable choisi ou « à confirmer ».
    const shipping = await planShipping(tx, {
      groups: quote.sellers.map((group) => ({ sellerId: group.sellerId, lines: group.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })), totalXof: group.totalXof })),
      countryCode: input.delivery.countryCode, city: delivery.address.city ?? null, methodCode: input.delivery.shippingMethodCode ?? null,
      freeShipping: quote.freeShipping, requireBillable: requireBillableShipping,
    });
    const shippingXof = shipping.reduce((sum, plan) => sum + plan.costXof, 0);
    const grandTotalXof = quote.totals.totalXof + shippingXof;

    // Moyen de paiement : disponible pour ce pays, ce montant et les groupes du client.
    const availability = await paymentMethodAvailability(tx, paymentSettings, { countryCode: input.delivery.countryCode, amountXof: grandTotalXof, customerGroupIds: customer.groupIds });
    const choice = availability.find((entry) => entry.code === input.paymentMethod);
    if (!choice?.available || !choice.provider) throw errors.rule(choice?.reason ? `Moyen de paiement indisponible : ${choice.reason}` : "Moyen de paiement indisponible.", { method: input.paymentMethod, available: availability.filter((entry) => entry.available).map((entry) => entry.code) });

    // Bons : la limite globale est revérifiée et consommée de façon atomique.
    for (const voucher of quote.vouchers.applied) {
      const [consumed] = await tx.update(promoCodes).set({ usageCount: sql`${promoCodes.usageCount} + 1`, updatedAt: new Date() })
        .where(and(eq(promoCodes.id, voucher.voucherId), or(isNull(promoCodes.usageLimit), lt(promoCodes.usageCount, promoCodes.usageLimit)))).returning({ id: promoCodes.id });
      if (!consumed) throw errors.conflict(`Le bon « ${voucher.code} » vient d'atteindre sa limite d'utilisation.`);
    }

    const checkoutGroupId = randomUUID();
    const year = new Date().getFullYear();
    const paymentExpiresAt = paymentDeadline(input.paymentMethod, paymentSettings);
    const created: Array<{ id: string; reference: string; sellerId: string; totalXof: number; payment: { provider: string; reference: string; status: string; checkoutUrl?: string | null } }> = [];

    for (const [groupIndex, group] of quote.sellers.entries()) {
      const plan = shipping[groupIndex];
      const orderTotalXof = group.totalXof + plan.costXof;
      const reference = await nextDocumentNumber(tx, "order", year);
      const appliedVouchers = quote.vouchers.applied.map((voucher) => ({ code: voucher.code, discountXof: 0 }));
      const [order] = await tx.insert(orders).values({
        buyerId: input.userId, customerId: customer.customerId, reference, checkoutGroupId, status: "awaiting_payment",
        subtotalXof: group.subtotalExclTaxXof, discountXof: group.discountXof, taxXof: group.taxXof, totalXof: orderTotalXof, shippingCostXof: plan.costXof,
        shippingMethodId: plan.methodId, shippingMode: plan.mode, shippingQuoteSnapshot: plan.snapshot,
        deliveryMethod: input.delivery.method, pickupPointId: delivery.pickupPointId, deliveryAddress: delivery.address, paymentExpiresAt, locale: input.delivery.language,
        appliedVouchers: group.discountXof > 0 ? appliedVouchers.map((voucher) => ({ ...voucher, discountXof: group.discountXof })) : [],
      }).returning();
      await tx.insert(orderItems).values(group.lines.map((line) => ({
        orderId: order.id, productId: line.productId, variantId: line.variantId, sellerId: group.sellerId, quantity: line.quantity,
        unitPriceXof: line.unitPriceExclTaxXof, taxRatePercent: String(line.taxRatePercent), discountXof: line.discountXof, lineTotalXof: line.totalXof,
        productTitle: line.title.slice(0, 190), productSku: line.sku, variantSnapshot: (line.variantLabel ? { label: line.variantLabel } : {}) as Record<string, string>,
        weightGrams: line.weightGrams, ecotaxXof: line.ecotaxXof, appliedTierMinimumQuantity: line.price?.tierApplied ? line.quantity : 1,
      })));
      try {
        await reserveOrderStock(tx, { orderId: order.id, expiresAt: paymentExpiresAt, lines: await stockLinesFor(tx, group.lines) });
      } catch (error) {
        if (error instanceof StockLedgerError && error.code === "INSUFFICIENT_STOCK") {
          const line = group.lines.find((entry) => entry.productId === error.details.productId);
          throw new AppError("BUSINESS_RULE", `Le stock de « ${line?.title ?? "un article"} » vient de changer : mettez le panier à jour.`, { reason: "insufficient_stock", ...error.details });
        }
        throw error;
      }
      if (orderTotalXof < 1) throw errors.rule("Le montant de la commande doit être d'au moins 1 FCFA.");
      await tx.insert(orderEvents).values({ orderId: order.id, status: "awaiting_payment", actorUserId: input.userId, note: input.paymentMethod === "cash_on_delivery" ? "Commande créée ; paiement à la livraison." : "Commande créée ; en attente de confirmation du paiement." });
      await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: null, toStatus: "awaiting_payment", note: "Commande passée par le client." });
      await emitEvent(tx, "order.created", { orderId: order.id, reference, totalXof: orderTotalXof }, { aggregateId: order.id, shopId: DEFAULT_SHOP_ID });
      created.push({ id: order.id, reference, sellerId: group.sellerId, totalXof: orderTotalXof, payment: { provider: choice.provider, reference: "", status: "pending" } });
    }

    // Un seul paiement pour toutes les commandes du passage en caisse.
    const { intent, payments: paymentRows } = await createIntent(tx, {
      checkoutGroupId, userId: input.userId, customerId: customer.customerId, method: input.paymentMethod, gatewayKey: choice.provider,
      countryCode: input.delivery.countryCode, expiresAt: paymentExpiresAt, orders: created.map((order) => ({ id: order.id, totalXof: order.totalXof })),
    });
    for (const order of created) order.payment.reference = paymentRows.find((row) => row.orderId === order.id)?.externalReference ?? intent.reference;

    // Une utilisation par bon et par passage de commande, rattachée à la première commande.
    for (const voucher of quote.vouchers.applied) {
      await tx.insert(promoCodeRedemptions).values({ promoCodeId: voucher.voucherId, customerId: customer.customerId, orderId: created[0].id, amountXof: voucher.discountXof });
    }
    if (input.cartId) await tx.update(carts).set({ status: "converted", convertedOrderId: created[0].id, updatedAt: new Date() }).where(and(eq(carts.id, input.cartId), eq(carts.customerId, customer.customerId)));

    return {
      checkoutGroupId,
      intentId: intent.id,
      orders: created,
      totals: { ...quote.totals, shippingXof, totalXof: grandTotalXof },
      shipping: shipping.map((plan, index) => ({ sellerId: quote.sellers[index].sellerId, costXof: plan.costXof, methodCode: (plan.snapshot as { methodCode?: string } | null)?.methodCode ?? null, mode: plan.mode, toConfirm: plan.methodId === null })),
      vouchers: quote.vouchers.applied.map((voucher) => ({ code: voucher.code, discountXof: voucher.discountXof })),
      lines: quote.lines.map(publicLine),
    };
  });
  // Initialisation chez le prestataire, hors transaction : un échec laisse la commande payable (nouvelle tentative).
  const payment = await initiateIntent(database, result.intentId, { language: input.delivery.language === "en" ? "en" : "fr" });
  const { intentId: _intentId, ...rest } = result;
  void _intentId;
  return { ...rest, orders: rest.orders.map((order) => ({ ...order, payment: { ...order.payment, checkoutUrl: payment.checkoutUrl } })), payment };
}
