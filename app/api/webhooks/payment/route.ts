import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { escrowEntries, orderEvents, orderItems, orders, payments, platformSettings } from "@/lib/db/schema";
import { getPaymentProvider } from "@/lib/payments/provider";
import { confirmOrderReservations, releaseOrderStock } from "@/lib/stock-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-afm-signature") || "";
  if (!getPaymentProvider().verifyWebhook(rawBody, signature)) return Response.json({ error: "Signature invalide" }, { status: 401 });
  let payload: { reference?: string; status?: string; amountXof?: number; currency?: string };
  try { payload = JSON.parse(rawBody); } catch { return Response.json({ error: "JSON invalide" }, { status: 400 }); }
  if (!payload.reference || !["paid", "failed", "pending"].includes(payload.status || "") || !Number.isInteger(payload.amountXof) || payload.currency !== "XOF") return Response.json({ error: "Événement incomplet ou devise non prise en charge" }, { status: 400 });
  const db = getDb();
  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.externalReference, payload.reference!)).limit(1);
      if (!payment) return "unknown" as const;
      // Paiements créés depuis l'étape 5 : réglés par /api/webhooks/payments/{prestataire} (intention, journal, idempotence).
      if (payment.intentId) return "use_payment_intents" as const;
      if (payment.amountXof !== payload.amountXof) return "amount_mismatch" as const;
      if (payment.status === "succeeded") return "already_paid" as const;
      if (payload.status === "pending") return "pending" as const;
      const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
      if (!order) return "order_state_conflict" as const;
      if (order.status === "cancelled" && payload.status === "paid" && ["cancelled","failed"].includes(payment.status)) {
        await tx.update(payments).set({ status: "succeeded" }).where(eq(payments.id, payment.id));
        await tx.update(orders).set({ status: "refunded", updatedAt: new Date() }).where(eq(orders.id, order.id));
        await tx.insert(escrowEntries).values({ orderId: order.id, amountXof: payment.amountXof, commissionBps: 0, commissionXof: 0, sellerNetXof: 0, status: "refund_pending" }).onConflictDoNothing();
        await tx.insert(orderEvents).values({ orderId: order.id, status: "refunded", note: "Paiement reçu après expiration/annulation; remboursement PSP requis." });
        return "late_paid_refund_required" as const;
      }
      if (payment.status !== "pending") return "already_processed" as const;
      if (order.status !== "awaiting_payment") return "order_state_conflict" as const;

      if (payload.status === "failed") {
        const [failedPayment] = await tx.update(payments).set({ status: "failed" }).where(and(eq(payments.id, payment.id), eq(payments.status, "pending"))).returning({ id: payments.id });
        if (!failedPayment) return "already_processed" as const;
        const [cancelledOrder] = await tx.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_payment"))).returning({ id: orders.id });
        if (cancelledOrder) {
          const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          await releaseOrderStock(tx, { orderId: order.id, lines: lines.map((line) => ({ productId: line.productId, variantId: null, quantity: line.quantity })), note: "Paiement refusé." });
          await tx.insert(orderEvents).values({ orderId: order.id, status: "cancelled", note: "Paiement échoué; réservation de stock libérée." });
        }
        return "failed_restocked" as const;
      }

      const [configuredCommission] = await tx.select().from(platformSettings).where(eq(platformSettings.key, "commission_bps")).limit(1);
      const fallbackCommission = Number(process.env.PLATFORM_COMMISSION_BPS || 800);
      const rawCommission = configuredCommission ? Number(configuredCommission.value) : fallbackCommission;
      const commissionBps = Number.isInteger(rawCommission) ? Math.max(0, Math.min(2000, rawCommission)) : 800;
      const commissionXof = Math.round(payment.amountXof * commissionBps / 10000);
      const [paidPayment] = await tx.update(payments).set({ status: "succeeded" }).where(and(eq(payments.id, payment.id), eq(payments.status, "pending"))).returning({ id: payments.id });
      if (!paidPayment) return "already_processed" as const;
      const [paidOrder] = await tx.update(orders).set({ status: "paid_escrow", paymentExpiresAt: null, updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.status, "awaiting_payment"))).returning({ id: orders.id });
      if (!paidOrder) throw new Error("Le paiement a été confirmé, mais l’état de commande a changé. Rapprochement manuel requis.");
      await confirmOrderReservations(tx, order.id);
      await tx.insert(escrowEntries).values({ orderId: order.id, amountXof: payment.amountXof, commissionBps, commissionXof, sellerNetXof: payment.amountXof - commissionXof, status: "blocked" }).onConflictDoNothing();
      await tx.insert(orderEvents).values({ orderId: order.id, status: "paid_escrow", note: "Paiement confirmé par webhook; écriture ledger bloquée créée." });
      return "paid" as const;
    });
    if (result === "unknown") return Response.json({ error: "Référence inconnue" }, { status: 404 });
    if (result === "use_payment_intents") return Response.json({ error: "Paiement géré par /api/webhooks/payments/mock" }, { status: 409 });
    if (result === "amount_mismatch") return Response.json({ error: "Montant ne correspondant pas à la commande" }, { status: 409 });
    if (result === "order_state_conflict") return Response.json({ error: "État de commande incompatible" }, { status: 409 });
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error("payment_webhook_failed", error);
    return Response.json({ error: "Erreur de traitement" }, { status: 500 });
  }
}
