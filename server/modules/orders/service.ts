/**
 * Commandes (administration) : liste, détail, changements de statut et leurs effets, factures et
 * avoirs numérotés sans trou.
 *
 * Effets d'un changement de statut (dans la même transaction que le statut) :
 *   - payée          → paiement réglé, réservation confirmée, séquestre bloqué (commission) ;
 *   - expédiée/livrée → les unités réservées sortent du stock physique ;
 *   - livrée         → séquestre éligible au paiement du vendeur ;
 *   - annulée        → réservation libérée (ou stock restitué pour une commande ancienne),
 *                      paiement en attente annulé, séquestre à rembourser ;
 *   - remboursée     → séquestre à rembourser (le stock suit le retour, pas le remboursement).
 * Les transitions autorisées sont celles de lib/order-rules (parcours strict).
 */
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { canTransition, nextStatuses, ORDER_STATUS_LABELS, shouldRestoreStock, type OrderStatus } from "@/lib/order-rules";
import { confirmOrderReservations, consumeOrderReservations, releaseOrderStock } from "@/lib/stock-ledger";
import { nextDocumentNumber } from "@/lib/document-numbers";
import {
  creditNotes, escrowEntries, invoices, orderEvents, orderItems, orderStatusHistory, orders, payments, platformSettings, stockReservations, users,
} from "@/lib/db/schema";
import type { Db, Executor } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { recordAudit } from "@/server/core/audit";
import { emitEvent } from "@/server/core/events";
import { buildOrderBy, buildWhere, likePattern, listMeta, type ListQuery, type ListSpec } from "@/server/core/http/list-query";
import { fromLedgerError, type Context } from "@/server/modules/catalog/shared";

const STATUSES = ["awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid", "cancelled", "dispute", "refunded"] as const;

export const orderListSpec: ListSpec = {
  sortable: { createdAt: orders.createdAt, totalXof: orders.totalXof, updatedAt: orders.updatedAt, reference: orders.reference },
  filterable: {
    status: { column: orders.status, type: "enum", values: STATUSES }, buyerId: { column: orders.buyerId, type: "uuid" }, customerId: { column: orders.customerId, type: "uuid" },
    checkoutGroupId: { column: orders.checkoutGroupId, type: "uuid" }, createdAt: { column: orders.createdAt, type: "date" }, totalXof: { column: orders.totalXof, type: "number" },
    deliveryMethod: { column: orders.deliveryMethod, type: "enum", values: ["delivery", "pickup"] },
  },
  defaultSort: "-createdAt",
  maxLimit: 200,
};

const label = (status: string) => ORDER_STATUS_LABELS[status as OrderStatus] ?? status;

export async function listOrders(database: Db, query: ListQuery) {
  // La recherche libre porte sur la référence et sur l'acheteur (nom, e-mail).
  const search = query.q ? or(ilike(orders.reference, likePattern(query.q)), ilike(users.email, likePattern(query.q)), ilike(users.name, likePattern(query.q))) : undefined;
  const where = buildWhere({ ...query, q: undefined }, orderListSpec, [isNull(orders.deletedAt), search]);
  const [rows, [total]] = await Promise.all([
    database.select({ order: orders, buyerName: users.name, buyerEmail: users.email }).from(orders).innerJoin(users, eq(users.id, orders.buyerId)).where(where)
      .orderBy(...buildOrderBy(query, orderListSpec, orders.id)).limit(query.limit).offset(query.offset),
    database.select({ value: count() }).from(orders).innerJoin(users, eq(users.id, orders.buyerId)).where(where),
  ]);
  return {
    data: rows.map(({ order, buyerName, buyerEmail }) => ({
      id: order.id, reference: order.reference, status: order.status, statusLabel: label(order.status), buyer: { id: order.buyerId, name: buyerName, email: buyerEmail },
      totalXof: order.totalXof, discountXof: order.discountXof, deliveryMethod: order.deliveryMethod, createdAt: order.createdAt.toISOString(), paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null,
    })),
    meta: listMeta(query, Number(total?.value ?? 0)),
  };
}

async function findOrder(executor: Executor, id: string, lock = false) {
  const query = executor.select().from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt))).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw errors.notFound("Commande", id);
  return row;
}

export async function getOrder(database: Db, id: string) {
  const order = await findOrder(database, id);
  const [buyer, items, paymentRows, history, invoiceRows, creditRows, reservations, escrow] = await Promise.all([
    database.select({ id: users.id, name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, order.buyerId)).limit(1),
    database.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id)),
    database.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.createdAt)),
    database.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.createdAt)),
    database.select().from(invoices).where(eq(invoices.orderId, id)).orderBy(asc(invoices.createdAt)),
    database.select().from(creditNotes).where(eq(creditNotes.orderId, id)).orderBy(asc(creditNotes.createdAt)),
    database.select().from(stockReservations).where(eq(stockReservations.orderId, id)),
    database.select().from(escrowEntries).where(eq(escrowEntries.orderId, id)).limit(1),
  ]);
  return {
    id: order.id, reference: order.reference, status: order.status, statusLabel: label(order.status), nextStatuses: nextStatuses(order.status).map((status) => ({ status, label: label(status) })),
    version: order.version, buyer: buyer[0] ?? null, customerId: order.customerId, checkoutGroupId: order.checkoutGroupId,
    deliveryMethod: order.deliveryMethod, deliveryAddress: order.deliveryAddress, pickupPointId: order.pickupPointId, trackingNumber: order.trackingNumber, internalNote: order.internalNote,
    totals: { subtotalExclTaxXof: order.subtotalXof, discountXof: order.discountXof, taxXof: order.taxXof, shippingXof: order.shippingCostXof, totalXof: order.totalXof },
    vouchers: order.appliedVouchers,
    milestones: { createdAt: order.createdAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null, shippedAt: order.shippedAt?.toISOString() ?? null, deliveredAt: order.deliveredAt?.toISOString() ?? null, cancelledAt: order.cancelledAt?.toISOString() ?? null, refundedAt: order.refundedAt?.toISOString() ?? null, paymentExpiresAt: order.paymentExpiresAt?.toISOString() ?? null },
    items: items.map((item) => ({ id: item.id, productId: item.productId, variantId: item.variantId, title: item.productTitle, sku: item.productSku, variant: item.variantSnapshot?.label ?? null, quantity: item.quantity, returnedQuantity: item.returnedQuantity, unitPriceExclTaxXof: item.unitPriceXof, taxRatePercent: Number(item.taxRatePercent), discountXof: item.discountXof, totalXof: item.lineTotalXof || item.unitPriceXof * item.quantity })),
    payments: paymentRows.map((payment) => ({ id: payment.id, method: payment.method, status: payment.status, amountXof: payment.amountXof, provider: payment.provider, reference: payment.externalReference, createdAt: payment.createdAt.toISOString() })),
    history: history.map((entry) => ({ from: entry.fromStatus, to: entry.toStatus, label: label(entry.toStatus), employeeId: entry.employeeId, note: entry.note, at: entry.createdAt.toISOString() })),
    invoices: invoiceRows.map((invoice) => ({ id: invoice.id, number: invoice.invoiceNumber, status: invoice.status, totalXof: invoice.totalXof, issuedAt: invoice.issuedAt?.toISOString() ?? null })),
    creditNotes: creditRows.map((note) => ({ id: note.id, number: note.creditNoteNumber, amountXof: note.amountXof, reason: note.reason, createdAt: note.createdAt.toISOString() })),
    reservations: reservations.map((reservation) => ({ productId: reservation.productId, variantId: reservation.variantId, quantity: reservation.quantity, status: reservation.status })),
    escrow: escrow[0] ? { status: escrow[0].status, amountXof: escrow[0].amountXof, commissionXof: escrow[0].commissionXof, sellerNetXof: escrow[0].sellerNetXof } : null,
  };
}

async function commissionBps(executor: Executor): Promise<number> {
  const [row] = await executor.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "commission_bps")).limit(1);
  const raw = row ? Number(row.value) : Number(process.env.PLATFORM_COMMISSION_BPS || 800);
  return Number.isInteger(raw) ? Math.max(0, Math.min(2000, raw)) : 800;
}

export async function changeStatus(database: Db, id: string, input: { status: OrderStatus; note?: string | null; trackingNumber?: string | null; version?: number }, context: Context) {
  await database.transaction(async (tx) => {
    const order = await findOrder(tx, id, true);
    if (input.version !== undefined && input.version !== order.version) throw errors.conflict("La commande a changé entre-temps : rechargez-la.", { currentVersion: order.version });
    const check = canTransition(order.status, input.status);
    if (!check.allowed) throw errors.rule(check.message, { from: order.status, to: input.status });
    const now = new Date();
    const milestones: Partial<typeof orders.$inferInsert> =
      input.status === "paid_escrow" ? { paidAt: now, paymentExpiresAt: null } : input.status === "shipped" ? { shippedAt: now } : input.status === "delivered" ? { deliveredAt: now }
      : input.status === "cancelled" ? { cancelledAt: now } : input.status === "refunded" ? { refundedAt: now } : input.status === "seller_paid" ? { sellerPaidAt: now } : {};
    await tx.update(orders).set({ status: input.status, updatedAt: now, version: sql`${orders.version} + 1`, ...milestones, ...(input.trackingNumber ? { trackingNumber: input.trackingNumber } : {}) }).where(eq(orders.id, id));
    const items = await tx.select({ productId: orderItems.productId, variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, id));

    try {
      if (input.status === "paid_escrow") {
        await confirmOrderReservations(tx, id);
        await tx.update(payments).set({ status: "succeeded" }).where(and(eq(payments.orderId, id), eq(payments.status, "pending")));
        const bps = await commissionBps(tx);
        const commissionXof = Math.round((order.totalXof * bps) / 10_000);
        await tx.insert(escrowEntries).values({ orderId: id, amountXof: order.totalXof, commissionBps: bps, commissionXof, sellerNetXof: order.totalXof - commissionXof, status: "blocked" }).onConflictDoNothing();
      }
      if (input.status === "shipped" || input.status === "delivered") await consumeOrderReservations(tx, { orderId: id, employeeId: context.actor.employeeId });
      if (input.status === "delivered") await tx.update(escrowEntries).set({ status: "eligible" }).where(and(eq(escrowEntries.orderId, id), eq(escrowEntries.status, "blocked")));
      if (input.status === "cancelled" || input.status === "refunded") {
        await tx.update(escrowEntries).set({ status: "refund_pending" }).where(and(eq(escrowEntries.orderId, id), eq(escrowEntries.status, "blocked")));
        await tx.update(payments).set({ status: "cancelled" }).where(and(eq(payments.orderId, id), eq(payments.status, "pending")));
      }
      if (shouldRestoreStock(order.status, input.status) || (input.status === "refunded" && !order.shippedAt)) {
        // Commandes anciennes sans réservation : stock restitué au niveau où il avait été pris (produit).
        await releaseOrderStock(tx, { orderId: id, employeeId: context.actor.employeeId, note: `Commande ${input.status === "cancelled" ? "annulée" : "remboursée"} avant expédition.`, lines: items.map((item) => ({ productId: item.productId, variantId: null, quantity: item.quantity })) });
      }
    } catch (error) {
      fromLedgerError(error);
    }

    await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: order.status, toStatus: input.status, employeeId: context.actor.employeeId, note: input.note ?? null });
    await tx.insert(orderEvents).values({ orderId: id, status: input.status, note: input.note ?? `Statut : ${label(input.status)}.` });
    await recordAudit(tx, { action: "order.status_changed", entityType: "order", entityId: id, before: { status: order.status }, after: { status: input.status, trackingNumber: input.trackingNumber ?? order.trackingNumber }, details: { note: input.note ?? null }, actor: context.actor, meta: context.meta });
    await emitEvent(tx, "order.status_changed", { orderId: id, from: order.status, to: input.status }, { aggregateId: id, shopId: context.actor.shopId });
  });
  return getOrder(database, id);
}

export async function updateNote(database: Db, id: string, note: string, context: Context) {
  await database.transaction(async (tx) => {
    const order = await findOrder(tx, id, true);
    await tx.update(orders).set({ internalNote: note, updatedAt: new Date() }).where(eq(orders.id, id));
    await recordAudit(tx, { action: "order.note_updated", entityType: "order", entityId: id, before: { internalNote: order.internalNote }, after: { internalNote: note }, actor: context.actor, meta: context.meta });
  });
  return getOrder(database, id);
}

/* ─────────────────────────────  Factures et avoirs  ───────────────────────────── */

export async function issueInvoice(database: Db, orderId: string, context: Context) {
  return database.transaction(async (tx) => {
    const order = await findOrder(tx, orderId, true);
    if (order.status === "awaiting_payment" || order.status === "cancelled") throw errors.rule("Une facture s'émet après paiement, sur une commande non annulée.");
    const [existing] = await tx.select({ id: invoices.id, status: invoices.status }).from(invoices).where(and(eq(invoices.orderId, orderId), eq(invoices.status, "issued"))).limit(1);
    if (existing) throw errors.conflict("Cette commande a déjà une facture émise : annulez-la avant d'en émettre une autre.");
    const year = new Date().getFullYear();
    const number = await nextDocumentNumber(tx, "invoice", year);
    const [seller] = await tx.select({ name: users.name, email: users.email }).from(orderItems).innerJoin(users, eq(users.id, orderItems.sellerId)).where(eq(orderItems.orderId, orderId)).limit(1);
    const [invoice] = await tx.insert(invoices).values({
      orderId, invoiceNumber: number, status: "issued", subtotalXof: order.subtotalXof, discountXof: order.discountXof, shippingXof: order.shippingCostXof, taxXof: order.taxXof, totalXof: order.totalXof,
      issuedAt: new Date(), fiscalYear: year, sequenceNumber: Number(number.split("-").pop()),
      billingSnapshot: (order.deliveryAddress ?? {}) as Record<string, string>, sellerSnapshot: seller ? { name: seller.name, email: seller.email } : {},
    }).returning();
    await recordAudit(tx, { action: "invoice.issued", entityType: "order", entityId: orderId, after: { invoiceNumber: number, totalXof: order.totalXof }, actor: context.actor, meta: context.meta });
    return { id: invoice.id, number: invoice.invoiceNumber, totalXof: invoice.totalXof, issuedAt: invoice.issuedAt?.toISOString() ?? null };
  });
}

export async function createCreditNote(database: Db, orderId: string, input: { amountXof: number; reason: string }, context: Context) {
  return database.transaction(async (tx) => {
    await findOrder(tx, orderId, true);
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.orderId, orderId), eq(invoices.status, "issued"))).limit(1);
    if (!invoice) throw errors.rule("Un avoir se rattache à une facture émise.");
    const [{ value: credited }] = await tx.select({ value: sql<number>`coalesce(sum(${creditNotes.amountXof}), 0)::int` }).from(creditNotes).where(eq(creditNotes.invoiceId, invoice.id));
    if (Number(credited) + input.amountXof > invoice.totalXof) throw errors.rule(`L'avoir dépasse le montant restant de la facture (${invoice.totalXof - Number(credited)} FCFA).`);
    const year = new Date().getFullYear();
    const number = await nextDocumentNumber(tx, "credit_note", year);
    const taxXof = invoice.totalXof > 0 ? Math.round((invoice.taxXof * input.amountXof) / invoice.totalXof) : 0;
    const [note] = await tx.insert(creditNotes).values({ orderId, invoiceId: invoice.id, creditNoteNumber: number, amountXof: input.amountXof, taxXof, reason: input.reason, fiscalYear: year, sequenceNumber: Number(number.split("-").pop()), createdByEmployeeId: context.actor.employeeId }).returning();
    await recordAudit(tx, { action: "credit_note.created", entityType: "order", entityId: orderId, after: { creditNoteNumber: number, amountXof: input.amountXof, reason: input.reason }, actor: context.actor, meta: context.meta });
    return { id: note.id, number: note.creditNoteNumber, amountXof: note.amountXof, taxXof: note.taxXof };
  });
}

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;

/** Facture imprimable (HTML A4 ; « Imprimer » → PDF depuis le navigateur). */
export async function invoiceDocument(database: Db, invoiceId: string, options: { buyerId?: string } = {}) {
  const [invoice] = await database.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) throw errors.notFound("Facture", invoiceId);
  const order = await findOrder(database, invoice.orderId);
  if (options.buyerId && order.buyerId !== options.buyerId) throw errors.notFound("Facture", invoiceId);
  const items = await database.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  const billing = invoice.billingSnapshot;
  const rows = items.map((item) => `<tr><td>${escape(item.productTitle)}${item.variantSnapshot?.label ? ` — ${escape(item.variantSnapshot.label)}` : ""}</td><td class="n">${item.quantity}</td><td class="n">${money(item.unitPriceXof)}</td><td class="n">${Number(item.taxRatePercent)} %</td><td class="n">${money(item.lineTotalXof || item.unitPriceXof * item.quantity)}</td></tr>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${escape(invoice.invoiceNumber)}</title>
<style>body{font-family:system-ui,sans-serif;color:#111;margin:40px;font-size:13px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}.n{text-align:right}.totals{margin-top:16px;margin-left:auto;width:320px}.totals td{border:0;padding:4px 8px}.totals tr:last-child td{font-weight:700;border-top:2px solid #111}.muted{color:#555}.void{color:#b00;font-weight:700}@media print{body{margin:0}}</style></head><body>
<div style="display:flex;justify-content:space-between;gap:24px"><div><h1>Facture ${escape(invoice.invoiceNumber)}</h1><p class="muted">Émise le ${invoice.issuedAt ? new Intl.DateTimeFormat("fr-CI", { dateStyle: "long" }).format(invoice.issuedAt) : "—"} · Commande ${escape(order.reference ?? order.id)}</p>${invoice.status === "void" ? '<p class="void">FACTURE ANNULÉE</p>' : ""}</div>
<div><strong>mybigmarket</strong><br><span class="muted">Vendeur : ${escape(invoice.sellerSnapshot?.name ?? "")}</span></div></div>
<p><strong>Facturé à</strong><br>${escape(billing.name ?? "")}<br>${escape(billing.address ?? "")}<br>${escape(billing.city ?? "")} ${escape(billing.countryName ?? billing.countryCode ?? "")}<br>${escape(billing.phone ?? "")}</p>
<table><thead><tr><th>Article</th><th class="n">Qté</th><th class="n">Prix unitaire HT</th><th class="n">TVA</th><th class="n">Total TTC</th></tr></thead><tbody>${rows}</tbody></table>
<table class="totals"><tr><td>Sous-total HT</td><td class="n">${money(invoice.subtotalXof)}</td></tr>${invoice.discountXof ? `<tr><td>Remise</td><td class="n">−${money(invoice.discountXof)}</td></tr>` : ""}<tr><td>Taxes</td><td class="n">${money(invoice.taxXof)}</td></tr><tr><td>Livraison</td><td class="n">${money(invoice.shippingXof)}</td></tr><tr><td>Total TTC</td><td class="n">${money(invoice.totalXof)}</td></tr></table>
</body></html>`;
}

export const ORDER_STATUS_VALUES = STATUSES;
