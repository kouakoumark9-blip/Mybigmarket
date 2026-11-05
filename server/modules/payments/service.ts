/**
 * Paiements (étape 5).
 *
 * Une intention de paiement règle en une fois les commandes d'un même passage en caisse (une par
 * vendeur). Son cycle :
 *   1. créée dans la transaction de la commande (aucun appel réseau dans la transaction) ;
 *   2. initialisée chez le prestataire après validation (page hébergée ou consignes de virement) ;
 *   3. réglée par une notification signée, une vérification auprès du prestataire ou une confirmation
 *      manuelle de l'équipe (virement, paiement à la livraison) — toutes passent par `applyIntentOutcome`,
 *      donc les effets sont identiques : commandes « paiement confirmé », stock confirmé, séquestre ;
 *   4. un refus laisse la commande en attente jusqu'à son délai : le client peut réessayer avec un
 *      autre moyen ; à l'expiration, la commande est annulée et le stock libéré.
 * Chaque échange et chaque décision sont écrits au journal des transactions.
 */
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { canRefund, canTransition, type OrderStatus } from "@/lib/order-rules";
import { nextDocumentNumber } from "@/lib/document-numbers";
import {
  creditNotes, customerGroupPaymentRules, escrowEntries, invoices, orderEvents, orders, paymentCountryRules, paymentIntents, paymentMethodConfigs,
  paymentTransactions, paymentWebhookEvents, payments, refunds, stockReservations, users, DEFAULT_SHOP_ID,
} from "@/lib/db/schema";
import { sha256 } from "@/lib/payments/gateways";
import { gatewayByKey, gatewayForMethod } from "@/lib/payments/registry";
import { GatewayError, PAYMENT_METHOD_CODES, PAYMENT_METHOD_INFO, redacted, type GatewayStatus, type PaymentMethodCode } from "@/lib/payments/types";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { getSetting } from "@/server/core/settings";
import { buildOrderBy, buildWhere, likePattern, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import type { Context } from "@/server/modules/catalog/shared";
import { applyOrderStatus, commissionBps, employeeActor, systemActor, type StatusActor } from "@/server/modules/orders/service";

type IntentRow = typeof paymentIntents.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");

/* ─────────────────────────────  Journal  ───────────────────────────── */

export async function journal(executor: Executor, entry: {
  intentId?: string | null; paymentId?: string | null; orderId?: string | null; refundId?: string | null; kind: string; status: string; provider: string;
  providerReference?: string | null; amountXof?: number | null; request?: Record<string, unknown>; response?: Record<string, unknown>; error?: string | null;
  actorType?: "system" | "customer" | "employee" | "provider"; actorId?: string | null;
}) {
  await executor.insert(paymentTransactions).values({
    intentId: entry.intentId ?? null, paymentId: entry.paymentId ?? null, orderId: entry.orderId ?? null, refundId: entry.refundId ?? null,
    kind: entry.kind, status: entry.status, provider: entry.provider, providerReference: entry.providerReference ?? null, amountXof: entry.amountXof ?? null,
    request: redacted(entry.request ?? {}), response: redacted(entry.response ?? {}), error: entry.error?.slice(0, 2000) ?? null,
    actorType: entry.actorType ?? "system", actorId: entry.actorId ?? null,
  });
}

/* ─────────────────────────────  Moyens disponibles  ───────────────────────────── */

export type PaymentSettings = {
  bankTransfer: { accountHolder: string; bankName: string; iban: string; bic: string; instructions: string; expiryHours: number };
  cashOnDelivery: { maxAmountXof: number; countries: string[] };
  expiryMinutes: number;
};

export async function loadPaymentSettings(database: Db, shopId = DEFAULT_SHOP_ID): Promise<PaymentSettings> {
  const get = <K extends Parameters<typeof getSetting>[2]>(key: K) => getSetting(database, shopId, key);
  const [accountHolder, bankName, iban, bic, instructions, expiryHours, maxAmountXof, countries, expiryMinutes] = await Promise.all([
    get("payments.bank_transfer.account_holder"), get("payments.bank_transfer.bank_name"), get("payments.bank_transfer.iban"), get("payments.bank_transfer.bic"),
    get("payments.bank_transfer.instructions"), get("payments.bank_transfer.expiry_hours"), get("payments.cash_on_delivery.max_amount_xof"),
    get("payments.cash_on_delivery.countries"), get("orders.payment_expiry_minutes"),
  ]);
  return { bankTransfer: { accountHolder, bankName, iban, bic, instructions, expiryHours }, cashOnDelivery: { maxAmountXof, countries }, expiryMinutes };
}

export type MethodAvailability = {
  code: PaymentMethodCode; label: string; kind: string; provider: string | null; available: boolean;
  reasonCode?: "inactive" | "provider_not_configured" | "bank_details_missing" | "country_not_allowed" | "amount_below_minimum" | "amount_above_maximum" | "group_not_allowed" | "currency_not_supported";
  reason?: string;
};

const REASONS: Record<NonNullable<MethodAvailability["reasonCode"]>, string> = {
  inactive: "Désactivé par l'équipe.",
  provider_not_configured: "Aucun prestataire configuré pour ce moyen.",
  bank_details_missing: "Coordonnées bancaires non renseignées.",
  country_not_allowed: "Non proposé dans ce pays.",
  amount_below_minimum: "Montant inférieur au minimum de ce moyen.",
  amount_above_maximum: "Montant supérieur au maximum de ce moyen.",
  group_not_allowed: "Non proposé à ce groupe de clients.",
  currency_not_supported: "Devise non prise en charge.",
};

/**
 * Moyens de paiement pour un pays, un montant et des groupes de clients. Règles, dans l'ordre :
 * activation par l'équipe, prestataire configuré, coordonnées bancaires (virement), plafond et pays
 * (paiement à la livraison), règles par pays (si le moyen en a), règles par groupe de clients.
 */
export async function paymentMethodAvailability(executor: Executor, settings: PaymentSettings, input: { countryCode: string; amountXof: number; customerGroupIds?: number[] }): Promise<MethodAvailability[]> {
  const country = input.countryCode.toUpperCase();
  const [configs, rules, groupRules] = await Promise.all([
    executor.select().from(paymentMethodConfigs),
    executor.select({ code: paymentMethodConfigs.code, rule: paymentCountryRules }).from(paymentCountryRules).innerJoin(paymentMethodConfigs, eq(paymentMethodConfigs.id, paymentCountryRules.paymentMethodId)),
    input.customerGroupIds?.length ? executor.select().from(customerGroupPaymentRules).where(inArray(customerGroupPaymentRules.customerGroupId, input.customerGroupIds)) : Promise.resolve([]),
  ]);
  const configByCode = new Map(configs.map((row) => [row.code, row]));
  return PAYMENT_METHOD_CODES.map((code): MethodAvailability => {
    const info = PAYMENT_METHOD_INFO[code];
    const config = configByCode.get(code);
    const gateway = gatewayForMethod(code);
    const base = { code, label: config?.name || info.label, kind: info.kind, provider: gateway?.key ?? null };
    const refuse = (reasonCode: NonNullable<MethodAvailability["reasonCode"]>): MethodAvailability => ({ ...base, available: false, reasonCode, reason: REASONS[reasonCode] });
    // Sans ligne de configuration (base neuve), un moyen est actif, sauf le paiement à la livraison.
    if (config ? !config.isActive : code === "cash_on_delivery") return refuse("inactive");
    if (config && !config.supportedCurrencies.includes("XOF")) return refuse("currency_not_supported");
    if (!gateway) return refuse("provider_not_configured");
    if (code === "bank_transfer" && (!settings.bankTransfer.accountHolder || !settings.bankTransfer.iban)) return refuse("bank_details_missing");
    if (code === "cash_on_delivery") {
      if (!settings.cashOnDelivery.countries.includes(country)) return refuse("country_not_allowed");
      if (settings.cashOnDelivery.maxAmountXof > 0 && input.amountXof > settings.cashOnDelivery.maxAmountXof) return refuse("amount_above_maximum");
    }
    const methodRules = rules.filter((entry) => entry.code === code).map((entry) => entry.rule);
    if (methodRules.length) {
      const rule = methodRules.find((entry) => entry.countryCode.toUpperCase() === country);
      if (!rule || !rule.isAllowed) return refuse("country_not_allowed");
      if (input.amountXof < rule.minimumAmountXof) return refuse("amount_below_minimum");
      if (rule.maximumAmountXof !== null && input.amountXof > rule.maximumAmountXof) return refuse("amount_above_maximum");
    }
    if (groupRules.some((rule) => rule.paymentMethodCode === code && !rule.isAllowed)) return refuse("group_not_allowed");
    return { ...base, available: true };
  });
}

/** Délai de paiement selon le moyen : prestataire (minutes), virement (heures), livraison (aucun). */
export function paymentDeadline(method: PaymentMethodCode, settings: PaymentSettings, now = new Date()): Date | null {
  if (method === "cash_on_delivery") return null;
  if (method === "bank_transfer") return new Date(now.getTime() + settings.bankTransfer.expiryHours * 3_600_000);
  return new Date(now.getTime() + settings.expiryMinutes * 60_000);
}

/* ─────────────────────────────  Intentions  ───────────────────────────── */

const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newIntentReference(now = new Date()): string {
  const bytes = randomBytes(8);
  const random = Array.from(bytes, (byte) => BASE32[byte % BASE32.length]).join("");
  return `PAY-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${random}`;
}

/**
 * Crée l'intention et une ligne de paiement par commande, dans la transaction de l'appelant.
 * Aucun appel au prestataire ici : il a lieu après validation (`initiateIntent`).
 */
export async function createIntent(tx: Executor, input: {
  checkoutGroupId: string | null; userId: string; customerId: string | null; method: PaymentMethodCode; gatewayKey: string; countryCode: string;
  expiresAt: Date | null; orders: Array<{ id: string; totalXof: number }>;
}) {
  if (!input.orders.length) throw errors.rule("Aucune commande à régler.");
  const reference = newIntentReference();
  const amountXof = input.orders.reduce((sum, order) => sum + order.totalXof, 0);
  if (!Number.isSafeInteger(amountXof) || amountXof < 1) throw errors.rule("Le montant à régler doit être d'au moins 1 FCFA.");
  const [intent] = await tx.insert(paymentIntents).values({
    reference, checkoutGroupId: input.checkoutGroupId, userId: input.userId, customerId: input.customerId, method: input.method, provider: input.gatewayKey,
    amountXof, currency: "XOF", status: "pending", countryCode: input.countryCode, expiresAt: input.expiresAt,
  }).returning();
  const rows = await tx.insert(payments).values(input.orders.map((order, index) => ({
    orderId: order.id, method: input.method, amountXof: order.totalXof, status: "pending" as const, provider: input.gatewayKey,
    externalReference: input.orders.length === 1 ? reference : `${reference}-${index + 1}`, countryCode: input.countryCode, intentId: intent.id,
  }))).returning();
  await journal(tx, { intentId: intent.id, kind: "create", status: "ok", provider: input.gatewayKey, amountXof, request: { orders: input.orders.map((order) => order.id), method: input.method }, actorType: "customer", actorId: input.userId });
  return { intent, payments: rows };
}

function bankInstructions(settings: PaymentSettings, intent: IntentRow) {
  const bank = settings.bankTransfer;
  return {
    kind: "bank_transfer", accountHolder: bank.accountHolder, bankName: bank.bankName, iban: bank.iban, bic: bank.bic,
    reference: intent.reference, amountXof: intent.amountXof, currency: "XOF", deadline: intent.expiresAt?.toISOString() ?? null, note: bank.instructions,
  };
}

const codInstructions = (intent: IntentRow) => ({ kind: "cash_on_delivery", amountXof: intent.amountXof, currency: "XOF", note: "Réglez le montant exact en espèces ou par mobile money au livreur, à la remise du colis." });

export type IntentView = ReturnType<typeof intentView>;
export function intentView(intent: IntentRow, extra: { orders?: Array<{ id: string; reference: string | null; status: string; totalXof: number }>; error?: string | null } = {}) {
  return {
    id: intent.id, reference: intent.reference, status: intent.status, method: intent.method, methodLabel: PAYMENT_METHOD_INFO[intent.method as PaymentMethodCode]?.label ?? intent.method,
    provider: intent.provider, amountXof: intent.amountXof, currency: intent.currency, checkoutUrl: intent.status === "pending" ? intent.checkoutUrl : null,
    instructions: intent.instructions, expiresAt: intent.expiresAt?.toISOString() ?? null, paidAt: intent.paidAt?.toISOString() ?? null,
    failureReason: intent.failureReason, createdAt: intent.createdAt.toISOString(), orders: extra.orders, error: extra.error ?? null,
  };
}

async function intentOrders(executor: Executor, intentId: string) {
  return executor.select({ id: orders.id, reference: orders.reference, status: orders.status, totalXof: orders.totalXof })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.intentId, intentId)).orderBy(asc(orders.reference));
}

/** Initialise l'intention chez le prestataire, après validation de la commande. Un échec laisse l'intention en attente. */
export async function initiateIntent(database: Db, intentId: string, options: { language?: "fr" | "en" } = {}) {
  const [intent] = await database.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
  if (!intent) throw errors.notFound("Paiement", intentId);
  const linkedOrders = await intentOrders(database, intentId);
  if (intent.status !== "pending") return intentView(intent, { orders: linkedOrders });
  const gateway = gatewayByKey(intent.provider);
  if (!gateway) throw errors.unavailable("Prestataire de paiement indisponible.");
  const settings = await loadPaymentSettings(database);
  const [buyer] = intent.userId ? await database.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, intent.userId)).limit(1) : [];
  const [firstOrder] = linkedOrders.length ? await database.select({ deliveryAddress: orders.deliveryAddress }).from(orders).where(eq(orders.id, linkedOrders[0].id)).limit(1) : [];
  const address = (firstOrder?.deliveryAddress ?? {}) as Record<string, string>;
  const [firstName, ...rest] = (buyer?.name ?? "Client").trim().split(/\s+/);
  const instructions = intent.method === "bank_transfer" ? bankInstructions(settings, intent) : intent.method === "cash_on_delivery" ? codInstructions(intent) : undefined;
  const site = siteUrl();
  try {
    const result = await gateway.initiate({
      reference: intent.reference, amountXof: intent.amountXof, currency: "XOF", method: intent.method as PaymentMethodCode,
      description: `Commande ${linkedOrders.map((order) => order.reference).filter(Boolean).join(", ")}`.slice(0, 120),
      customer: { firstName: firstName ?? "Client", lastName: rest.join(" "), email: buyer?.email ?? "", phone: buyer?.phone ?? address.phone ?? null, address: address.address ?? null, city: address.city ?? null, countryCode: intent.countryCode ?? "CI" },
      returnUrl: `${site}/compte/commandes?paiement=${encodeURIComponent(intent.reference)}`, notifyUrl: `${site}/api/webhooks/payments/${gateway.key}`,
      language: options.language ?? "fr", instructions,
    });
    const [updated] = await database.update(paymentIntents).set({
      providerReference: result.providerReference, checkoutUrl: result.checkoutUrl ?? null, instructions: result.instructions ?? instructions ?? {},
      attempts: sql`${paymentIntents.attempts} + 1`, failureReason: null, updatedAt: new Date(),
    }).where(eq(paymentIntents.id, intentId)).returning();
    await journal(database, { intentId, kind: "initiate", status: "ok", provider: gateway.key, providerReference: result.providerReference, amountXof: intent.amountXof, request: result.request, response: result.response, actorType: "system" });
    return intentView(updated, { orders: linkedOrders });
  } catch (error) {
    const message = error instanceof GatewayError ? error.message : "Le paiement n'a pas pu être initialisé.";
    const [updated] = await database.update(paymentIntents).set({ attempts: sql`${paymentIntents.attempts} + 1`, failureReason: message.slice(0, 240), updatedAt: new Date() }).where(eq(paymentIntents.id, intentId)).returning();
    await journal(database, { intentId, kind: "initiate", status: "failed", provider: gateway.key, amountXof: intent.amountXof, error: error instanceof Error ? error.message : String(error), response: error instanceof GatewayError ? error.details : {}, actorType: "system" });
    if (!(error instanceof GatewayError)) console.error("payment_initiate_failed", error);
    return intentView(updated, { orders: linkedOrders, error: message });
  }
}

/* ─────────────────────────────  Règlement  ───────────────────────────── */

export type Outcome = { status: GatewayStatus; amountXof?: number; currency?: string; providerReference?: string | null; usedMethod?: string | null };
export type OutcomeSource = { kind: "notification" | "check" | "reconcile" | "manual_confirm" | "customer_return"; actorType: "provider" | "system" | "employee" | "customer"; actorId?: string | null; note?: string | null; statusActor?: StatusActor };
export type SettleResult = "paid" | "late_paid" | "already_paid" | "amount_mismatch" | "pending" | "failed" | "already_processed";

/**
 * Applique un état de paiement à une intention. Idempotent : un même état appliqué deux fois ne
 * produit aucun nouvel effet. Toutes les sources (notification, vérification, confirmation manuelle)
 * passent par ici.
 */
export async function applyIntentOutcome(database: Db, intentId: string, outcome: Outcome, source: OutcomeSource): Promise<{ result: SettleResult; details: Array<{ orderId: string; result: string }> }> {
  return database.transaction(async (tx) => {
    const [intent] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1).for("update");
    if (!intent) throw errors.notFound("Paiement", intentId);
    const now = new Date();
    const log = (kind: string, status: string, extra: { error?: string; response?: Record<string, unknown> } = {}) => journal(tx, {
      intentId, kind, status, provider: intent.provider, providerReference: outcome.providerReference ?? intent.providerReference, amountXof: outcome.amountXof ?? intent.amountXof,
      request: { source: source.kind, announced: outcome.status, note: source.note ?? null }, actorType: source.actorType, actorId: source.actorId ?? null, ...extra,
    });

    if (outcome.status === "pending") {
      await tx.update(paymentIntents).set({ lastCheckedAt: now, updatedAt: now }).where(eq(paymentIntents.id, intentId));
      await log(source.kind, "pending");
      return { result: "pending", details: [] };
    }

    if (outcome.status === "succeeded") {
      const mismatch = (outcome.currency !== undefined && outcome.currency !== intent.currency) || (outcome.amountXof !== undefined && outcome.amountXof !== intent.amountXof);
      if (mismatch) {
        await tx.update(paymentIntents).set({ metadata: { ...intent.metadata, mismatch: { amountXof: outcome.amountXof ?? null, currency: outcome.currency ?? null, at: now.toISOString() } }, updatedAt: now }).where(eq(paymentIntents.id, intentId));
        await log(source.kind, "amount_mismatch", { error: `Montant annoncé ${outcome.amountXof ?? "?"} ${outcome.currency ?? ""} ≠ ${intent.amountXof} ${intent.currency}.` });
        await emitEvent(tx, "payment.amount_mismatch", { intentId, reference: intent.reference, expectedXof: intent.amountXof, announcedXof: outcome.amountXof ?? null }, { aggregateId: intentId, shopId: DEFAULT_SHOP_ID });
        return { result: "amount_mismatch", details: [] };
      }
      if (intent.status === "succeeded") {
        await log(source.kind, "ignored", { response: { reason: "already_paid" } });
        return { result: "already_paid", details: [] };
      }
      const late = intent.status !== "pending";
      await tx.update(paymentIntents).set({
        status: "succeeded", paidAt: now, failureReason: null, providerReference: outcome.providerReference ?? intent.providerReference, lastCheckedAt: now, updatedAt: now,
        version: sql`${paymentIntents.version} + 1`, metadata: { ...intent.metadata, ...(outcome.usedMethod ? { usedMethod: outcome.usedMethod } : {}), ...(late ? { latePayment: true, previousStatus: intent.status } : {}) },
      }).where(eq(paymentIntents.id, intentId));
      const rows = await tx.select().from(payments).where(eq(payments.intentId, intentId));
      const details: Array<{ orderId: string; result: string }> = [];
      const actor = source.statusActor ?? systemActor("Paiement");
      for (const payment of rows) {
        const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1).for("update");
        if (!order) continue;
        if (payment.status !== "succeeded") await tx.update(payments).set({ status: "succeeded", paidAt: now, failureReason: null, updatedAt: now }).where(eq(payments.id, payment.id));
        details.push({ orderId: order.id, result: await settleOrder(tx, order, payment, intent, actor, now) });
        await emitEvent(tx, "payment.confirmed", { paymentId: payment.id, orderId: order.id, amountXof: payment.amountXof }, { aggregateId: order.id, shopId: DEFAULT_SHOP_ID });
      }
      await log(source.kind, "ok", { response: { orders: details } });
      await emitEvent(tx, "payment.succeeded", { intentId, reference: intent.reference, amountXof: intent.amountXof, method: intent.method, orders: details }, { aggregateId: intentId, shopId: DEFAULT_SHOP_ID });
      return { result: late ? "late_paid" : "paid", details };
    }

    // Refus ou abandon : les commandes restent payables jusqu'à leur délai (nouvelle tentative possible).
    if (intent.status !== "pending") {
      await log(source.kind, "ignored", { response: { reason: "already_processed", status: intent.status } });
      return { result: "already_processed", details: [] };
    }
    const status = outcome.status === "cancelled" ? "cancelled" : "failed";
    const reason = outcome.status === "cancelled" ? "Paiement abandonné." : "Paiement refusé par le prestataire.";
    await tx.update(paymentIntents).set({ status, ...(status === "failed" ? { failedAt: now } : { cancelledAt: now }), failureReason: reason, lastCheckedAt: now, updatedAt: now, version: sql`${paymentIntents.version} + 1` }).where(eq(paymentIntents.id, intentId));
    const rows = await tx.update(payments).set({ status: status === "failed" ? "failed" : "cancelled", failureReason: reason, updatedAt: now }).where(and(eq(payments.intentId, intentId), eq(payments.status, "pending"))).returning({ orderId: payments.orderId });
    for (const row of rows) await tx.insert(orderEvents).values({ orderId: row.orderId, status: "awaiting_payment", note: `${reason} Vous pouvez réessayer avec un autre moyen avant l'expiration du délai.` });
    await log(source.kind, status);
    await emitEvent(tx, "payment.failed", { intentId, reference: intent.reference, status }, { aggregateId: intentId, shopId: DEFAULT_SHOP_ID });
    return { result: "failed", details: rows.map((row) => ({ orderId: row.orderId, result: status })) };
  });
}

/** Effet d'un paiement encaissé sur une commande. */
async function settleOrder(tx: Executor, order: typeof orders.$inferSelect, payment: PaymentRow, intent: IntentRow, actor: StatusActor, now: Date): Promise<string> {
  if (order.status === "awaiting_payment") {
    await applyOrderStatus(tx, order, { status: "paid_escrow", note: `Paiement confirmé (${PAYMENT_METHOD_INFO[intent.method as PaymentMethodCode]?.label ?? intent.method}, ${intent.reference}).` }, actor);
    return "paid";
  }
  if (order.status === "cancelled") {
    // Paiement reçu après l'expiration ou l'annulation : la commande n'est pas relancée, le client doit être remboursé.
    await tx.insert(escrowEntries).values({ orderId: order.id, amountXof: payment.amountXof, commissionBps: 0, commissionXof: 0, sellerNetXof: 0, status: "refund_pending" }).onConflictDoNothing();
    await tx.insert(orderEvents).values({ orderId: order.id, status: "cancelled", note: "Paiement reçu après l'annulation de la commande : remboursement à effectuer." });
    await emitEvent(tx, "payment.refund_required", { orderId: order.id, intentId: intent.id, amountXof: payment.amountXof, reason: "late_payment" }, { aggregateId: order.id, shopId: DEFAULT_SHOP_ID });
    return "late_refund_required";
  }
  if (payment.method === "cash_on_delivery") {
    // Paiement à la livraison : encaissé après la préparation ; le séquestre naît à l'encaissement.
    const bps = await commissionBps(tx);
    const commissionXof = Math.round((payment.amountXof * bps) / 10_000);
    const delivered = order.status === "delivered" || Boolean(order.deliveredAt);
    await tx.insert(escrowEntries).values({ orderId: order.id, amountXof: payment.amountXof, commissionBps: bps, commissionXof, sellerNetXof: payment.amountXof - commissionXof, status: delivered ? "eligible" : "blocked" }).onConflictDoNothing();
    await tx.update(orders).set({ paidAt: now, paymentExpiresAt: null, updatedAt: now }).where(eq(orders.id, order.id));
    await tx.insert(orderEvents).values({ orderId: order.id, status: order.status, note: "Paiement encaissé à la livraison." });
    return "cod_collected";
  }
  // Commande déjà réglée par un autre paiement : double paiement, à rembourser.
  await tx.insert(orderEvents).values({ orderId: order.id, status: order.status, note: `Paiement en double reçu (${intent.reference}) : remboursement à effectuer.` });
  await emitEvent(tx, "payment.refund_required", { orderId: order.id, intentId: intent.id, amountXof: payment.amountXof, reason: "duplicate_payment" }, { aggregateId: order.id, shopId: DEFAULT_SHOP_ID });
  return "duplicate_refund_required";
}

/* ─────────────────────────────  Notifications  ───────────────────────────── */

/**
 * Traite une notification de prestataire :
 *   - signature invalide : 401, tracée sans contenu, aucun effet ;
 *   - notification déjà reçue (même clé) : 200 avec le résultat initial, aucun retraitement ;
 *   - état confirmé par l'API du prestataire quand il l'exige, sinon lu dans la notification signée.
 */
export async function handleWebhook(database: Db, providerKey: string, rawBody: string, headers: Headers): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const gateway = gatewayByKey(providerKey);
  if (!gateway || !gateway.sendsWebhooks) return { httpStatus: 404, body: { error: "Prestataire inconnu." } };
  if (rawBody.length > 64_000) return { httpStatus: 413, body: { error: "Notification trop volumineuse." } };
  const parsed = gateway.parseWebhook({ rawBody, headers });
  const payloadSha256 = sha256(rawBody);

  if (!parsed.signatureValid) {
    await database.insert(paymentWebhookEvents).values({ provider: gateway.key, eventKey: `rejected:${payloadSha256}`, signatureValid: false, status: "rejected", outcome: "invalid_signature", payloadSha256, payload: {}, error: parsed.error ?? "Signature invalide." })
      .onConflictDoUpdate({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.eventKey], set: { attempts: sql`${paymentWebhookEvents.attempts} + 1` } });
    return { httpStatus: 401, body: { error: "Signature invalide." } };
  }

  const [inserted] = await database.insert(paymentWebhookEvents).values({ provider: gateway.key, eventKey: parsed.eventKey, signatureValid: true, status: "received", payloadSha256, payload: parsed.payload })
    .onConflictDoNothing().returning();
  let event = inserted;
  if (!event) {
    const [existing] = await database.update(paymentWebhookEvents).set({ attempts: sql`${paymentWebhookEvents.attempts} + 1` })
      .where(and(eq(paymentWebhookEvents.provider, gateway.key), eq(paymentWebhookEvents.eventKey, parsed.eventKey))).returning();
    // Une notification dont le traitement avait échoué (prestataire injoignable) est retraitée ; les autres jamais.
    if (existing.status !== "failed") return { httpStatus: 200, body: { ok: true, duplicate: true, result: existing.outcome } };
    event = existing;
  }
  const finish = async (status: string, outcome: string, extra: { error?: string; intentId?: string } = {}) => {
    await database.update(paymentWebhookEvents).set({ status, outcome, error: extra.error ?? null, intentId: extra.intentId ?? null, processedAt: new Date() }).where(eq(paymentWebhookEvents.id, event.id));
  };

  if (!parsed.reference) {
    await finish("ignored", "missing_reference", { error: parsed.error ?? "Référence absente." });
    return { httpStatus: 400, body: { error: "Notification incomplète." } };
  }
  const [intent] = await database.select().from(paymentIntents).where(eq(paymentIntents.reference, parsed.reference)).limit(1);
  if (!intent || intent.provider !== gateway.key) {
    await finish("ignored", "unknown_reference");
    return { httpStatus: 404, body: { error: "Référence inconnue." } };
  }

  let outcome: Outcome;
  if (parsed.needsConfirmation || !parsed.status) {
    try {
      const checked = await gateway.check(intent.reference, intent.providerReference);
      await journal(database, { intentId: intent.id, kind: "check", status: checked.status, provider: gateway.key, providerReference: checked.providerReference ?? intent.providerReference, amountXof: checked.amountXof ?? null, request: checked.request, response: checked.response, actorType: "provider" });
      outcome = checked;
    } catch (error) {
      await finish("failed", "check_failed", { error: error instanceof Error ? error.message : String(error), intentId: intent.id });
      return { httpStatus: 503, body: { error: "Vérification impossible pour le moment, réessayez." } };
    }
  } else {
    outcome = { status: parsed.status, amountXof: parsed.amountXof, currency: parsed.currency, providerReference: parsed.providerReference };
  }

  try {
    const settled = await applyIntentOutcome(database, intent.id, outcome, { kind: "notification", actorType: "provider" });
    await finish("processed", settled.result, { intentId: intent.id });
    if (settled.result === "amount_mismatch") return { httpStatus: 409, body: { error: "Montant ne correspondant pas au paiement attendu." } };
    return { httpStatus: 200, body: { ok: true, result: settled.result } };
  } catch (error) {
    await finish("failed", "processing_error", { error: error instanceof Error ? error.message : String(error), intentId: intent.id });
    console.error("payment_webhook_failed", error);
    return { httpStatus: 500, body: { error: "Erreur de traitement." } };
  }
}

/* ─────────────────────────────  Vérification, confirmation, annulation  ───────────────────────────── */

async function findIntent(executor: Executor, idOrReference: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrReference);
  const [intent] = await executor.select().from(paymentIntents).where(isUuid ? eq(paymentIntents.id, idOrReference) : eq(paymentIntents.reference, idOrReference)).limit(1);
  if (!intent) throw errors.notFound("Paiement", idOrReference);
  return intent;
}

/** Interroge le prestataire et applique l'état réel (rapprochement). */
export async function reconcileIntent(database: Db, idOrReference: string, source: Pick<OutcomeSource, "kind" | "actorType" | "actorId" | "statusActor"> = { kind: "reconcile", actorType: "system" }) {
  const intent = await findIntent(database, idOrReference);
  const gateway = gatewayByKey(intent.provider);
  if (!gateway || gateway.key === "manual") throw errors.rule("Ce paiement se confirme manuellement : il n'y a rien à vérifier auprès d'un prestataire.");
  if (intent.status === "succeeded") return { result: "already_paid" as SettleResult, intent: intentView(intent) };
  let checked;
  try {
    checked = await gateway.check(intent.reference, intent.providerReference);
  } catch (error) {
    await journal(database, { intentId: intent.id, kind: source.kind, status: "failed", provider: gateway.key, error: error instanceof Error ? error.message : String(error), actorType: source.actorType, actorId: source.actorId ?? null });
    throw errors.unavailable(error instanceof GatewayError ? error.message : "Le prestataire ne répond pas.");
  }
  await journal(database, { intentId: intent.id, kind: "check", status: checked.status, provider: gateway.key, providerReference: checked.providerReference ?? null, amountXof: checked.amountXof ?? null, request: checked.request, response: checked.response, actorType: source.actorType, actorId: source.actorId ?? null });
  const settled = await applyIntentOutcome(database, intent.id, checked, { ...source });
  const [after] = await database.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
  return { result: settled.result, intent: intentView(after, { orders: await intentOrders(database, intent.id) }) };
}

/** Confirmation par l'équipe d'un encaissement manuel (virement reçu, espèces encaissées à la livraison). */
export async function confirmIntentManually(database: Db, idOrReference: string, input: { amountXof?: number; providerReference?: string | null; note?: string | null }, context: Context) {
  const intent = await findIntent(database, idOrReference);
  if (intent.provider !== "manual") throw errors.rule("Seuls le virement et le paiement à la livraison se confirment manuellement ; pour un autre moyen, lancez une vérification auprès du prestataire.");
  if (intent.status === "succeeded") throw errors.conflict("Ce paiement est déjà confirmé.");
  const amountXof = input.amountXof ?? intent.amountXof;
  if (amountXof !== intent.amountXof) throw errors.rule(`Montant reçu (${amountXof} FCFA) différent du montant attendu (${intent.amountXof} FCFA) : le paiement reste en attente.`, { expectedXof: intent.amountXof });
  const settled = await applyIntentOutcome(database, intent.id, { status: "succeeded", amountXof, currency: "XOF", providerReference: input.providerReference ?? null }, {
    kind: "manual_confirm", actorType: "employee", actorId: context.actor.employeeId ?? context.actor.actorId, note: input.note ?? null, statusActor: employeeActor(context),
  });
  await recordAudit(database, { action: "payment.confirmed", entityType: "payment_intent", entityId: intent.id, before: { status: intent.status }, after: { status: "succeeded", result: settled.result }, details: { reference: intent.reference, providerReference: input.providerReference ?? null, note: input.note ?? null }, actor: context.actor, meta: context.meta });
  return getIntent(database, intent.id);
}

/** Annule une intention en attente (nouvelle tentative du client, décision de l'équipe). */
export async function cancelIntent(executor: Executor, intent: IntentRow, reason: string, actor: { type: "customer" | "employee" | "system"; id?: string | null }) {
  if (intent.status !== "pending") return false;
  const now = new Date();
  await executor.update(paymentIntents).set({ status: "cancelled", cancelledAt: now, failureReason: reason.slice(0, 240), updatedAt: now, version: sql`${paymentIntents.version} + 1` }).where(and(eq(paymentIntents.id, intent.id), eq(paymentIntents.status, "pending")));
  await executor.update(payments).set({ status: "cancelled", failureReason: reason.slice(0, 240), updatedAt: now }).where(and(eq(payments.intentId, intent.id), eq(payments.status, "pending")));
  await journal(executor, { intentId: intent.id, kind: "cancel", status: "ok", provider: intent.provider, error: reason, actorType: actor.type, actorId: actor.id ?? null });
  return true;
}

export async function cancelIntentByAdmin(database: Db, idOrReference: string, reason: string, context: Context) {
  const intent = await findIntent(database, idOrReference);
  if (intent.status !== "pending") throw errors.rule("Seul un paiement en attente peut être annulé.");
  await database.transaction(async (tx) => { await cancelIntent(tx, intent, reason, { type: "employee", id: context.actor.employeeId }); });
  await recordAudit(database, { action: "payment.cancelled", entityType: "payment_intent", entityId: intent.id, before: { status: intent.status }, after: { status: "cancelled" }, details: { reason }, actor: context.actor, meta: context.meta });
  return getIntent(database, intent.id);
}

/* ─────────────────────────────  Expiration et rapprochement planifiés  ───────────────────────────── */

/**
 * Tâche planifiée : vérifie d'abord auprès du prestataire les paiements en attente des commandes
 * échues (un paiement abouti dont la notification s'est perdue n'est pas annulé), puis annule les
 * commandes toujours impayées, libère leur stock et clôt leurs intentions.
 */
export async function expireOverduePayments(database: Db, now = new Date(), limit = 100) {
  const overdue = await database.select({ id: orders.id }).from(orders).where(and(eq(orders.status, "awaiting_payment"), lt(orders.paymentExpiresAt, now))).limit(limit);
  const orderIds = overdue.map((row) => row.id);
  let checked = 0;
  if (orderIds.length) {
    const pending = await database.selectDistinct({ id: paymentIntents.id }).from(payments).innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId))
      .where(and(inArray(payments.orderId, orderIds), eq(paymentIntents.status, "pending"), ne(paymentIntents.provider, "manual")));
    for (const row of pending) {
      try { await reconcileIntent(database, row.id, { kind: "reconcile", actorType: "system" }); checked++; } catch (error) { console.error("payment_reconcile_failed", row.id, error instanceof Error ? error.message : error); }
    }
  }
  let expired = 0;
  const actor = systemActor("Expiration des paiements");
  for (const orderId of orderIds) {
    const changed = await database.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.status, "awaiting_payment"), lt(orders.paymentExpiresAt, now))).limit(1).for("update");
      if (!order) return false;
      await applyOrderStatus(tx, order, { status: "cancelled", note: "Délai de paiement expiré ; stock remis en vente.", releaseAs: "expired" }, actor);
      const linked = await tx.selectDistinct({ intentId: payments.intentId }).from(payments).where(and(eq(payments.orderId, orderId), sql`${payments.intentId} is not null`));
      for (const { intentId } of linked) {
        const open = await tx.select({ value: count() }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(and(eq(payments.intentId, intentId!), eq(orders.status, "awaiting_payment")));
        if (Number(open[0]?.value ?? 0) > 0) continue;
        const [closed] = await tx.update(paymentIntents).set({ status: "expired", failureReason: "Délai de paiement expiré.", updatedAt: now }).where(and(eq(paymentIntents.id, intentId!), eq(paymentIntents.status, "pending"))).returning();
        if (closed) await journal(tx, { intentId: closed.id, kind: "expire", status: "ok", provider: closed.provider, amountXof: closed.amountXof });
      }
      return true;
    });
    if (changed) expired++;
  }
  return { examined: orderIds.length, checked, expired };
}

/** Rapprochement des paiements en attente depuis plus de `olderThanMinutes` (notifications perdues). */
export async function reconcilePendingIntents(database: Db, options: { olderThanMinutes?: number; limit?: number } = {}) {
  const before = new Date(Date.now() - (options.olderThanMinutes ?? 10) * 60_000);
  const rows = await database.select({ id: paymentIntents.id }).from(paymentIntents)
    .where(and(eq(paymentIntents.status, "pending"), ne(paymentIntents.provider, "manual"), lt(paymentIntents.createdAt, before), or(isNull(paymentIntents.lastCheckedAt), lt(paymentIntents.lastCheckedAt, before))))
    .orderBy(asc(paymentIntents.createdAt)).limit(options.limit ?? 50);
  const results: Array<{ id: string; result: string }> = [];
  for (const row of rows) {
    try { results.push({ id: row.id, result: (await reconcileIntent(database, row.id)).result }); } catch (error) { results.push({ id: row.id, result: `error: ${error instanceof Error ? error.message : String(error)}` }); }
  }
  return results;
}

/* ─────────────────────────────  Côté client  ───────────────────────────── */

/** État d'un paiement pour son client ; vérifie au passage auprès du prestataire (retour de la page de paiement). */
export async function getIntentForCustomer(database: Db, userId: string, reference: string) {
  const intent = await findIntent(database, reference);
  if (intent.userId !== userId) throw errors.notFound("Paiement", reference);
  const stale = !intent.lastCheckedAt || Date.now() - intent.lastCheckedAt.getTime() > 30_000;
  if (intent.status === "pending" && intent.provider !== "manual" && stale) {
    try { await reconcileIntent(database, intent.id, { kind: "customer_return", actorType: "customer", actorId: userId }); } catch { /* l'état affiché reste celui connu */ }
  }
  const [fresh] = await database.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
  return intentView(fresh, { orders: await intentOrders(database, intent.id) });
}

/**
 * Nouvelle tentative de paiement (autre moyen, ou même moyen après un refus) pour les commandes encore
 * impayées d'un même passage en caisse. Les intentions en attente sur ces commandes sont annulées.
 */
export async function retryPayment(database: Db, userId: string, input: { orderId: string; method: PaymentMethodCode; customerGroupIds?: number[] }) {
  const settings = await loadPaymentSettings(database);
  const created = await database.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.buyerId, userId), isNull(orders.deletedAt))).limit(1).for("update");
    if (!order) throw errors.notFound("Commande", input.orderId);
    const now = new Date();
    if (order.status !== "awaiting_payment") throw errors.rule("Cette commande n'attend plus de paiement.");
    if (order.paymentExpiresAt && order.paymentExpiresAt <= now) throw errors.rule("Le délai de paiement de cette commande est dépassé.");
    const group = order.checkoutGroupId
      ? await tx.select().from(orders).where(and(eq(orders.checkoutGroupId, order.checkoutGroupId), eq(orders.buyerId, userId), eq(orders.status, "awaiting_payment"), isNull(orders.deletedAt))).for("update")
      : [order];
    const payable = group.filter((entry) => !entry.paymentExpiresAt || entry.paymentExpiresAt > now);
    const amountXof = payable.reduce((sum, entry) => sum + entry.totalXof, 0);
    const country = ((order.deliveryAddress ?? {}) as Record<string, string>).countryCode || (await tx.select({ countryCode: payments.countryCode }).from(payments).where(eq(payments.orderId, order.id)).limit(1))[0]?.countryCode || "CI";
    const availability = await paymentMethodAvailability(tx, settings, { countryCode: country, amountXof, customerGroupIds: input.customerGroupIds });
    const choice = availability.find((entry) => entry.code === input.method);
    if (!choice?.available || !choice.provider) throw errors.rule(choice?.reason ? `Moyen de paiement indisponible : ${choice.reason}` : "Moyen de paiement indisponible.", { method: input.method });
    const previous = await tx.selectDistinct({ intent: paymentIntents }).from(payments).innerJoin(paymentIntents, eq(paymentIntents.id, payments.intentId)).where(and(inArray(payments.orderId, payable.map((entry) => entry.id)), eq(paymentIntents.status, "pending")));
    for (const { intent } of previous) await cancelIntent(tx, intent, "Remplacé par une nouvelle tentative du client.", { type: "customer", id: userId });
    // Délai propre au nouveau moyen (virement plus long, livraison sans délai), jamais raccourci.
    const deadline = paymentDeadline(input.method, settings, now);
    for (const entry of payable) {
      const next = deadline === null ? null : entry.paymentExpiresAt && entry.paymentExpiresAt > deadline ? entry.paymentExpiresAt : deadline;
      await tx.update(orders).set({ paymentExpiresAt: next, updatedAt: now }).where(eq(orders.id, entry.id));
      await tx.update(stockReservations).set({ expiresAt: next }).where(and(eq(stockReservations.orderId, entry.id), eq(stockReservations.status, "active")));
    }
    const result = await createIntent(tx, {
      checkoutGroupId: order.checkoutGroupId, userId, customerId: order.customerId, method: input.method, gatewayKey: choice.provider, countryCode: country,
      expiresAt: deadline, orders: payable.map((entry) => ({ id: entry.id, totalXof: entry.totalXof })),
    });
    return result.intent;
  });
  return initiateIntent(database, created.id);
}

/* ─────────────────────────────  Administration : consultation  ───────────────────────────── */

export const intentListSpec: ListSpec = {
  sortable: { createdAt: paymentIntents.createdAt, amountXof: paymentIntents.amountXof, updatedAt: paymentIntents.updatedAt },
  filterable: {
    status: { column: paymentIntents.status, type: "enum", values: ["pending", "succeeded", "failed", "cancelled", "expired"] },
    method: { column: paymentIntents.method, type: "enum", values: [...PAYMENT_METHOD_CODES, "mock"] },
    provider: { column: paymentIntents.provider, type: "string" },
    createdAt: { column: paymentIntents.createdAt, type: "date" },
    amountXof: { column: paymentIntents.amountXof, type: "number" },
  },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

export async function listIntents(database: Db, query: ListQuery) {
  const search = query.q ? or(ilike(paymentIntents.reference, likePattern(query.q)), ilike(paymentIntents.providerReference, likePattern(query.q))) : undefined;
  const where = buildWhere({ ...query, q: undefined }, intentListSpec, [search]);
  const [rows, [total]] = await Promise.all([
    database.select().from(paymentIntents).where(where).orderBy(...buildOrderBy(query, intentListSpec, paymentIntents.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(paymentIntents).where(where),
  ]);
  return { data: rows.map((row) => intentView(row)), meta: listMeta(query, Number(total?.value ?? 0)) };
}

export async function getIntent(database: Db, idOrReference: string) {
  const intent = await findIntent(database, idOrReference);
  const [lines, transactions, events] = await Promise.all([
    database.select({ payment: payments, order: { id: orders.id, reference: orders.reference, status: orders.status, totalXof: orders.totalXof } }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.intentId, intent.id)).orderBy(asc(orders.reference)),
    database.select().from(paymentTransactions).where(eq(paymentTransactions.intentId, intent.id)).orderBy(asc(paymentTransactions.createdAt)),
    database.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.intentId, intent.id)).orderBy(asc(paymentWebhookEvents.receivedAt)),
  ]);
  return {
    ...intentView(intent, { orders: lines.map((line) => line.order) }),
    providerReference: intent.providerReference, attempts: intent.attempts, metadata: intent.metadata, lastCheckedAt: intent.lastCheckedAt?.toISOString() ?? null,
    payments: lines.map(({ payment, order }) => ({ id: payment.id, orderId: order.id, orderReference: order.reference, status: payment.status, amountXof: payment.amountXof, refundedAmountXof: payment.refundedAmountXof, paidAt: payment.paidAt?.toISOString() ?? null })),
    transactions: transactions.map((entry) => ({ id: entry.id, kind: entry.kind, status: entry.status, amountXof: entry.amountXof, providerReference: entry.providerReference, error: entry.error, actorType: entry.actorType, request: entry.request, response: entry.response, at: entry.createdAt.toISOString() })),
    notifications: events.map((entry) => ({ id: entry.id, status: entry.status, outcome: entry.outcome, attempts: entry.attempts, receivedAt: entry.receivedAt.toISOString(), processedAt: entry.processedAt?.toISOString() ?? null })),
  };
}

export const webhookListSpec: ListSpec = {
  sortable: { receivedAt: paymentWebhookEvents.receivedAt },
  filterable: {
    status: { column: paymentWebhookEvents.status, type: "enum", values: ["received", "processed", "rejected", "failed", "ignored"] },
    provider: { column: paymentWebhookEvents.provider, type: "string" },
    signatureValid: { column: paymentWebhookEvents.signatureValid, type: "boolean" },
    receivedAt: { column: paymentWebhookEvents.receivedAt, type: "date" },
  },
  defaultSort: "-receivedAt",
  maxLimit: 200,
};

export async function listWebhookEvents(database: Db, query: ListQuery) {
  const where = buildWhere(query, webhookListSpec, []);
  const [rows, [total]] = await Promise.all([
    database.select().from(paymentWebhookEvents).where(where).orderBy(...buildOrderBy(query, webhookListSpec, paymentWebhookEvents.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(paymentWebhookEvents).where(where),
  ]);
  return {
    data: rows.map((row) => ({ id: row.id, provider: row.provider, eventKey: row.eventKey, intentId: row.intentId, signatureValid: row.signatureValid, status: row.status, outcome: row.outcome, attempts: row.attempts, error: row.error, receivedAt: row.receivedAt.toISOString(), processedAt: row.processedAt?.toISOString() ?? null })),
    meta: listMeta(query, Number(total?.value ?? 0)),
  };
}

/* ─────────────────────────────  Administration : moyens de paiement  ───────────────────────────── */

export async function listPaymentMethodConfigs(database: Db) {
  const settings = await loadPaymentSettings(database);
  const [configs, rules, availability] = await Promise.all([
    database.select().from(paymentMethodConfigs),
    database.select({ code: paymentMethodConfigs.code, rule: paymentCountryRules }).from(paymentCountryRules).innerJoin(paymentMethodConfigs, eq(paymentMethodConfigs.id, paymentCountryRules.paymentMethodId)),
    paymentMethodAvailability(database, settings, { countryCode: "CI", amountXof: 10_000 }),
  ]);
  return PAYMENT_METHOD_CODES.map((code) => {
    const config = configs.find((row) => row.code === code);
    const gateway = gatewayForMethod(code);
    return {
      code, label: config?.name ?? PAYMENT_METHOD_INFO[code].label, kind: PAYMENT_METHOD_INFO[code].kind, isActive: config ? config.isActive : code !== "cash_on_delivery", configured: Boolean(config),
      mode: config?.mode ?? "test", provider: gateway?.key ?? null, providerConfigured: Boolean(gateway),
      availableInCI: availability.find((entry) => entry.code === code)?.available ?? false, unavailableReason: availability.find((entry) => entry.code === code)?.reason ?? null,
      countryRules: rules.filter((entry) => entry.code === code).map(({ rule }) => ({ countryCode: rule.countryCode, isAllowed: rule.isAllowed, minimumAmountXof: rule.minimumAmountXof, maximumAmountXof: rule.maximumAmountXof })),
    };
  });
}

async function ensureMethodConfig(executor: Executor, code: PaymentMethodCode) {
  const [existing] = await executor.select().from(paymentMethodConfigs).where(eq(paymentMethodConfigs.code, code)).limit(1);
  if (existing) return existing;
  const [created] = await executor.insert(paymentMethodConfigs).values({ code, name: PAYMENT_METHOD_INFO[code].label, provider: code.replace(/_/g, "-"), isActive: code !== "cash_on_delivery" }).returning();
  return created;
}

export async function updatePaymentMethod(database: Db, code: PaymentMethodCode, input: { isActive?: boolean; name?: string; mode?: "test" | "live" }, context: Context) {
  await database.transaction(async (tx) => {
    const before = await ensureMethodConfig(tx, code);
    await tx.update(paymentMethodConfigs).set({ ...(input.isActive !== undefined ? { isActive: input.isActive } : {}), ...(input.name ? { name: input.name } : {}), ...(input.mode ? { mode: input.mode } : {}), updatedAt: new Date() }).where(eq(paymentMethodConfigs.id, before.id));
    await recordAudit(tx, { action: "payment_method.updated", entityType: "payment_method", entityId: code, before: { isActive: before.isActive, name: before.name, mode: before.mode }, after: input, actor: context.actor, meta: context.meta });
  });
  return (await listPaymentMethodConfigs(database)).find((entry) => entry.code === code)!;
}

/** Remplace les règles par pays d'un moyen. Liste vide : moyen proposé dans tous les pays desservis. */
export async function setPaymentCountryRules(database: Db, code: PaymentMethodCode, rules: Array<{ countryCode: string; isAllowed: boolean; minimumAmountXof?: number; maximumAmountXof?: number | null }>, context: Context) {
  const unique = new Map(rules.map((rule) => [rule.countryCode.toUpperCase(), rule]));
  await database.transaction(async (tx) => {
    const config = await ensureMethodConfig(tx, code);
    await tx.delete(paymentCountryRules).where(eq(paymentCountryRules.paymentMethodId, config.id));
    if (unique.size) {
      await tx.insert(paymentCountryRules).values([...unique.entries()].map(([countryCode, rule]) => ({
        paymentMethodId: config.id, countryCode, isAllowed: rule.isAllowed, minimumAmountXof: rule.minimumAmountXof ?? 0, maximumAmountXof: rule.maximumAmountXof ?? null,
      })));
    }
    await recordAudit(tx, { action: "payment_method.country_rules_replaced", entityType: "payment_method", entityId: code, after: { rules: [...unique.values()] }, actor: context.actor, meta: context.meta });
  });
  return (await listPaymentMethodConfigs(database)).find((entry) => entry.code === code)!;
}

/* ─────────────────────────────  Remboursements  ───────────────────────────── */

const ACTIVE_REFUND_STATUSES = ["succeeded", "processing", "pending"] as const;

export const refundListSpec: ListSpec = {
  sortable: { createdAt: refunds.createdAt, amountXof: refunds.amountXof },
  filterable: {
    status: { column: refunds.status, type: "enum", values: ["pending", "processing", "succeeded", "failed", "cancelled"] },
    orderId: { column: refunds.orderId, type: "uuid" },
    createdAt: { column: refunds.createdAt, type: "date" },
  },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

const refundView = (row: typeof refunds.$inferSelect) => ({
  id: row.id, reference: row.reference, orderId: row.orderId, paymentId: row.paymentId, amountXof: row.amountXof, status: row.status, method: row.method,
  providerReference: row.providerReference, reason: row.reason, processedAt: row.processedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
});

export async function listRefunds(database: Db, query: ListQuery) {
  const where = buildWhere(query, refundListSpec, []);
  const [rows, [total]] = await Promise.all([
    database.select().from(refunds).where(where).orderBy(...buildOrderBy(query, refundListSpec, refunds.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(refunds).where(where),
  ]);
  return { data: rows.map(refundView), meta: listMeta(query, Number(total?.value ?? 0)) };
}

/**
 * Remboursement d'une commande : jamais plus que l'encaissé (remboursements en cours compris).
 * Un avoir est émis dans la même transaction quand la commande a une facture. Le remboursement est
 * ensuite transmis au prestataire s'il sait rembourser par API ; sinon il reste « en cours » jusqu'à
 * sa confirmation par l'équipe (espace marchand, virement, espèces).
 */
export async function createRefund(database: Db, orderId: string, input: { amountXof: number; reason: string; method?: "original" | "manual"; closeOrder?: boolean }, context: Context) {
  const prepared = await database.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), isNull(orders.deletedAt))).limit(1).for("update");
    if (!order) throw errors.notFound("Commande", orderId);
    const paid = await tx.select().from(payments).where(and(eq(payments.orderId, orderId), inArray(payments.status, ["succeeded", "refunded"])));
    const paidXof = paid.reduce((sum, payment) => sum + payment.amountXof, 0);
    const existing = await tx.select({ amountXof: refunds.amountXof }).from(refunds).where(and(eq(refunds.orderId, orderId), inArray(refunds.status, [...ACTIVE_REFUND_STATUSES])));
    const refundedXof = existing.reduce((sum, refund) => sum + refund.amountXof, 0);
    const check = canRefund(paidXof, refundedXof, input.amountXof);
    if (!check.allowed) throw errors.rule(check.message, { reason: check.reason, remainingXof: check.remainingXof });
    const payment = paid.find((entry) => entry.status === "succeeded") ?? paid[0];
    const now = new Date();
    const year = now.getFullYear();
    const [refund] = await tx.insert(refunds).values({
      reference: await nextDocumentNumber(tx, "refund", year), orderId, paymentId: payment?.id ?? null, amountXof: input.amountXof, status: "processing",
      method: input.method ?? "original", reason: input.reason, createdByEmployeeId: context.actor.employeeId,
    }).returning();
    // Avoir comptable, seulement si une facture a été émise (dans la limite du montant facturé restant).
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.orderId, orderId), eq(invoices.status, "issued"))).limit(1);
    if (invoice) {
      const [credited] = await tx.select({ value: sql<number>`coalesce(sum(${creditNotes.amountXof}), 0)::int` }).from(creditNotes).where(eq(creditNotes.invoiceId, invoice.id));
      const creditable = Math.min(input.amountXof, invoice.totalXof - Number(credited?.value ?? 0));
      if (creditable > 0) {
        const number = await nextDocumentNumber(tx, "credit_note", year);
        await tx.insert(creditNotes).values({ orderId, invoiceId: invoice.id, creditNoteNumber: number, amountXof: creditable, reason: input.reason, refundId: refund.id, fiscalYear: year, createdByEmployeeId: context.actor.employeeId });
      }
    }
    const intent = payment?.intentId ? (await tx.select().from(paymentIntents).where(eq(paymentIntents.id, payment.intentId)).limit(1))[0] : undefined;
    await journal(tx, { intentId: intent?.id ?? null, paymentId: payment?.id ?? null, orderId, refundId: refund.id, kind: "refund_create", status: "ok", provider: intent?.provider ?? payment?.provider ?? "manual", amountXof: input.amountXof, request: { reason: input.reason, method: input.method ?? "original" }, actorType: "employee", actorId: context.actor.employeeId });
    // `remainingXof` : reste remboursable après ce remboursement.
    if (input.closeOrder && check.remainingXof === 0 && canTransition(order.status, "refunded").allowed) {
      await applyOrderStatus(tx, order, { status: "refunded", note: `Remboursement intégral : ${input.reason}` }, employeeActor(context));
    }
    await recordAudit(tx, { action: "refund.created", entityType: "refund", entityId: refund.id, after: { orderId, amountXof: input.amountXof, method: input.method ?? "original" }, details: { reason: input.reason }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "refund.created", { refundId: refund.id, orderId, amountXof: input.amountXof }, { aggregateId: orderId, shopId: context.actor.shopId });
    return { refund, intent, payment };
  });

  const { refund, intent } = prepared;
  const gateway = intent && (input.method ?? "original") === "original" ? gatewayByKey(intent.provider) : null;
  if (!gateway) return { ...refundView(refund), mode: "manual" as const };
  const result = await gateway.refund({ reference: intent!.reference, providerReference: intent!.providerReference, amountXof: refund.amountXof, reason: refund.reason, refundReference: refund.reference })
    .catch((error) => ({ mode: "automatic" as const, status: "failed" as const, request: {}, response: {}, error: error instanceof Error ? error.message : String(error) }));
  await journal(database, { intentId: intent!.id, orderId, refundId: refund.id, kind: "refund", status: result.status, provider: gateway.key, providerReference: "providerReference" in result ? result.providerReference ?? null : null, amountXof: refund.amountXof, request: result.request, response: result.response, error: "error" in result ? result.error ?? null : null, actorType: "employee", actorId: context.actor.employeeId });
  if (result.mode === "automatic" && result.status === "succeeded") return { ...(await completeRefund(database, refund.id, { providerReference: "providerReference" in result ? result.providerReference ?? null : null, note: "Remboursé par le prestataire." }, context)), mode: "automatic" as const };
  if (result.mode === "automatic" && result.status === "failed") return { ...(await failRefund(database, refund.id, { reason: ("error" in result && result.error) || "Refusé par le prestataire." }, context)), mode: "automatic" as const };
  return { ...refundView(refund), mode: result.mode };
}

/** Confirme qu'un remboursement a bien été versé ; met à jour le paiement et le séquestre. */
export async function completeRefund(database: Db, refundId: string, input: { providerReference?: string | null; note?: string | null }, context: Context) {
  const done = await database.transaction(async (tx) => {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1).for("update");
    if (!refund) throw errors.notFound("Remboursement", refundId);
    if (refund.status === "succeeded") throw errors.conflict("Ce remboursement est déjà confirmé.");
    if (!["processing", "pending"].includes(refund.status)) throw errors.rule("Seul un remboursement en cours peut être confirmé.");
    const now = new Date();
    const [updated] = await tx.update(refunds).set({ status: "succeeded", processedAt: now, providerReference: input.providerReference ?? refund.providerReference }).where(eq(refunds.id, refundId)).returning();
    if (refund.paymentId) {
      const [payment] = await tx.update(payments).set({ refundedAmountXof: sql`${payments.refundedAmountXof} + ${refund.amountXof}`, updatedAt: now }).where(eq(payments.id, refund.paymentId)).returning();
      if (payment && payment.refundedAmountXof >= payment.amountXof) await tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
    }
    // Séquestre : remboursement intégral → remboursé ; partiel → montant et part vendeur réduits (s'il n'est pas déjà versé).
    const [escrow] = await tx.select().from(escrowEntries).where(eq(escrowEntries.orderId, refund.orderId)).limit(1).for("update");
    if (escrow && !["released", "refunded", "cancelled"].includes(escrow.status)) {
      const remaining = Math.max(0, escrow.amountXof - refund.amountXof);
      if (remaining === 0) await tx.update(escrowEntries).set({ status: "refunded", amountXof: 0, commissionXof: 0, sellerNetXof: 0 }).where(eq(escrowEntries.id, escrow.id));
      else {
        const commissionXof = Math.round((remaining * escrow.commissionBps) / 10_000);
        await tx.update(escrowEntries).set({ amountXof: remaining, commissionXof, sellerNetXof: remaining - commissionXof }).where(eq(escrowEntries.id, escrow.id));
      }
    }
    await tx.insert(orderEvents).values({ orderId: refund.orderId, status: "refunded", note: `Remboursement de ${refund.amountXof} FCFA effectué (${refund.reference}).` });
    await journal(tx, { orderId: refund.orderId, paymentId: refund.paymentId, refundId, kind: "refund_complete", status: "ok", provider: "manual", providerReference: input.providerReference ?? null, amountXof: refund.amountXof, request: { note: input.note ?? null }, actorType: "employee", actorId: context.actor.employeeId });
    await recordAudit(tx, { action: "refund.completed", entityType: "refund", entityId: refundId, before: { status: refund.status }, after: { status: "succeeded" }, details: { providerReference: input.providerReference ?? null, note: input.note ?? null }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "refund.completed", { refundId, orderId: refund.orderId, amountXof: refund.amountXof }, { aggregateId: refund.orderId, shopId: context.actor.shopId });
    if (refund.paymentId) await emitEvent(tx, "payment.refunded", { paymentId: refund.paymentId, orderId: refund.orderId, amountXof: refund.amountXof }, { aggregateId: refund.orderId, shopId: context.actor.shopId });
    return updated;
  });
  return refundView(done);
}

export async function failRefund(database: Db, refundId: string, input: { reason: string }, context: Context) {
  const failed = await database.transaction(async (tx) => {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1).for("update");
    if (!refund) throw errors.notFound("Remboursement", refundId);
    if (!["processing", "pending"].includes(refund.status)) throw errors.rule("Seul un remboursement en cours peut être déclaré en échec.");
    const [updated] = await tx.update(refunds).set({ status: "failed", processedAt: new Date() }).where(eq(refunds.id, refundId)).returning();
    await journal(tx, { orderId: refund.orderId, paymentId: refund.paymentId, refundId, kind: "refund_failed", status: "failed", provider: "manual", amountXof: refund.amountXof, error: input.reason, actorType: "employee", actorId: context.actor.employeeId });
    await recordAudit(tx, { action: "refund.failed", entityType: "refund", entityId: refundId, before: { status: refund.status }, after: { status: "failed" }, details: { reason: input.reason }, actor: context.actor, meta: context.meta });
    return updated;
  });
  return refundView(failed);
}

export type { OrderStatus };
