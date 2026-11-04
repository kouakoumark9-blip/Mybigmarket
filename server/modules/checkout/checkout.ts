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
import { getPaymentProvider, type PayMethod } from "@/lib/payments/provider";
import { countryName, destinationByCode, destinationCountries } from "@/lib/west-africa";
import {
  carts, customerAddresses, orderEvents, orderItems, orderStatusHistory, orders, packItems, payments, pickupPoints, products, promoCodeRedemptions, promoCodes, DEFAULT_SHOP_ID,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { AppError, errors } from "@/server/core/errors";
import { emitEvent } from "@/server/core/events";
import { getSetting } from "@/server/core/settings";
import { ensureCustomer, type CustomerContext } from "@/server/modules/checkout/customers";
import { publicLine, quoteCart, type QuoteLineInput, type QuotedLine } from "@/server/modules/checkout/quote";

export type DeliveryInput = {
  method: "delivery" | "pickup";
  countryCode: string;
  language: "fr" | "en" | "pt" | "ar";
  addressId?: string | null;
  address?: { name: string; phone: string; address: string; city: string } | null;
  pickupPointId?: number | null;
};

export type PlaceOrderInput = { userId: string; lines: QuoteLineInput[]; voucherCodes?: string[]; delivery: DeliveryInput; paymentMethod: PayMethod; cartId?: string | null };

async function deliverySnapshot(executor: Executor, customer: CustomerContext, delivery: DeliveryInput): Promise<{ address: Record<string, string>; pickupPointId: number | null }> {
  if (!destinationCountries.some((country) => country.code === delivery.countryCode)) throw errors.validation([{ path: "delivery.countryCode", message: "Pays de livraison non desservi." }]);
  const destination = destinationByCode(delivery.countryCode);
  if (!(destination.languageOptions || [destination.language]).includes(delivery.language)) throw errors.validation([{ path: "delivery.language", message: "Langue non proposée pour cette destination." }]);
  const common = { countryCode: delivery.countryCode, countryName: countryName(delivery.countryCode, "fr"), currency: destination.currency, language: delivery.language };
  if (delivery.method === "pickup") {
    if (delivery.countryCode !== "CI") throw errors.validation([{ path: "delivery.method", message: "Le point relais est proposé uniquement en Côte d'Ivoire." }]);
    if (!delivery.pickupPointId) throw errors.validation([{ path: "delivery.pickupPointId", message: "Choisissez un point relais." }]);
    const [point] = await executor.select({ id: pickupPoints.id }).from(pickupPoints).where(and(eq(pickupPoints.id, delivery.pickupPointId), eq(pickupPoints.isActive, true))).limit(1);
    if (!point) throw errors.validation([{ path: "delivery.pickupPointId", message: "Ce point relais n'est plus disponible." }]);
    return { address: common, pickupPointId: point.id };
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
  const expiryMinutes = await getSetting(database, DEFAULT_SHOP_ID, "orders.payment_expiry_minutes");
  const provider = getPaymentProvider();

  const result = await database.transaction(async (tx) => {
    const quote = await quoteCart(tx, { lines: input.lines, customer, countryCode: input.delivery.countryCode, voucherCodes: input.voucherCodes });
    if (!quote.lines.length) throw errors.rule("Le panier est vide.");
    const issues = quote.lines.filter((line) => line.issue).map((line) => ({ productId: line.productId, variantId: line.variantId, title: line.title, ...line.issue! }));
    if (issues.length) throw errors.rule("Certains articles ne peuvent pas être commandés en l'état : mettez le panier à jour.", { issues });
    const rejected = quote.vouchers.rejected.filter((entry) => entry.reason !== "not_combinable");
    if (rejected.length) throw errors.rule(rejected[0].message, { vouchers: rejected });

    // Bons : la limite globale est revérifiée et consommée de façon atomique.
    for (const voucher of quote.vouchers.applied) {
      const [consumed] = await tx.update(promoCodes).set({ usageCount: sql`${promoCodes.usageCount} + 1`, updatedAt: new Date() })
        .where(and(eq(promoCodes.id, voucher.voucherId), or(isNull(promoCodes.usageLimit), lt(promoCodes.usageCount, promoCodes.usageLimit)))).returning({ id: promoCodes.id });
      if (!consumed) throw errors.conflict(`Le bon « ${voucher.code} » vient d'atteindre sa limite d'utilisation.`);
    }

    const checkoutGroupId = randomUUID();
    const year = new Date().getFullYear();
    const paymentExpiresAt = new Date(Date.now() + expiryMinutes * 60_000);
    const created: Array<{ id: string; reference: string; sellerId: string; totalXof: number; payment: { provider: string; reference: string; status: string; checkoutUrl?: string } }> = [];

    for (const group of quote.sellers) {
      const reference = await nextDocumentNumber(tx, "order", year);
      const appliedVouchers = quote.vouchers.applied.map((voucher) => ({ code: voucher.code, discountXof: 0 }));
      const [order] = await tx.insert(orders).values({
        buyerId: input.userId, customerId: customer.customerId, reference, checkoutGroupId, status: "awaiting_payment",
        subtotalXof: group.subtotalExclTaxXof, discountXof: group.discountXof, taxXof: group.taxXof, totalXof: group.totalXof, shippingCostXof: 0,
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
      if (group.totalXof < 1) throw errors.rule("Le montant de la commande doit être d'au moins 1 FCFA.");
      const payment = await provider.createPayment(order.id, group.totalXof, input.paymentMethod);
      await tx.insert(payments).values({ orderId: order.id, method: input.paymentMethod, amountXof: group.totalXof, status: "pending", provider: payment.provider, externalReference: payment.reference, countryCode: input.delivery.countryCode });
      await tx.insert(orderEvents).values({ orderId: order.id, status: "awaiting_payment", actorUserId: input.userId, note: "Commande créée ; en attente de confirmation du paiement." });
      await tx.insert(orderStatusHistory).values({ orderId: order.id, fromStatus: null, toStatus: "awaiting_payment", note: "Commande passée par le client." });
      await emitEvent(tx, "order.created", { orderId: order.id, reference, totalXof: group.totalXof }, { aggregateId: order.id, shopId: DEFAULT_SHOP_ID });
      created.push({ id: order.id, reference, sellerId: group.sellerId, totalXof: group.totalXof, payment: { provider: payment.provider, reference: payment.reference, status: payment.status, checkoutUrl: payment.checkoutUrl } });
    }

    // Une utilisation par bon et par passage de commande, rattachée à la première commande.
    for (const voucher of quote.vouchers.applied) {
      await tx.insert(promoCodeRedemptions).values({ promoCodeId: voucher.voucherId, customerId: customer.customerId, orderId: created[0].id, amountXof: voucher.discountXof });
    }
    if (input.cartId) await tx.update(carts).set({ status: "converted", convertedOrderId: created[0].id, updatedAt: new Date() }).where(and(eq(carts.id, input.cartId), eq(carts.customerId, customer.customerId)));

    return {
      checkoutGroupId,
      orders: created,
      totals: quote.totals,
      vouchers: quote.vouchers.applied.map((voucher) => ({ code: voucher.code, discountXof: voucher.discountXof })),
      lines: quote.lines.map(publicLine),
    };
  });
  return result;
}
