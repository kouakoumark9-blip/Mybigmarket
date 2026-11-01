"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminDb } from "@/lib/db";
import {
  adminCreditNotes,
  adminEscrowEntries,
  adminInvoices,
  adminOrderItems,
  adminOrderStatusHistory,
  adminOrders,
  adminPayments,
  adminProducts,
  adminReturnRequestItems,
  adminReturnRequests,
  adminRefunds,
  employeeAuditLogs,
} from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import {
  canPaySeller,
  canRefund,
  canTransition,
  emailTriggerForTransition,
  shouldDecrementStock,
  shouldRestoreStock,
  ORDER_STATUS_LABELS,
} from "@/lib/order-rules";
import { fiscalYearOf, nextDocumentNumber } from "@/lib/document-numbers";

/**
 * Commandes, statuts, factures, avoirs, retours et remboursements — module 6.
 *
 * Règles verrouillées (ne pas régresser) :
 *  - toute transition passe par `canTransition` : aucune écriture directe ;
 *  - le stock n'est décrémenté qu'au paiement confirmé, jamais deux fois
 *    (la transition est conditionnée au statut courant dans le `where`) ;
 *  - le stock revient en vente seulement pour une annulation avant expédition ;
 *  - facture et avoir reçoivent un numéro de séquence dans la MÊME transaction
 *    que le document : pas de numéro orphelin, pas de trou ;
 *  - une facture émise n'est jamais régénérée ni modifiée ;
 *  - un remboursement ne dépasse jamais le reste remboursable ;
 *  - un retour ne porte que sur des quantités livrées non déjà retournées ;
 *  - tout est audité dans la transaction.
 */

const revalidateAll = (orderId?: string) => {
  revalidatePath("/commandes");
  revalidatePath("/factures");
  revalidatePath("/");
  if (orderId) revalidatePath(`/commandes/${orderId}`);
};

const statusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.string().trim().min(3).max(48),
  note: z.string().trim().min(3).max(300),
});

/**
 * Change le statut d'une commande, avec tous ses effets de bord.
 * La mise à jour est conditionnée au statut lu : deux employés qui changent le
 * statut en même temps ne peuvent pas décrémenter le stock deux fois.
 */
export async function changeOrderStatusAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.status.update");
  const parsed = statusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note"),
  });
  if (!parsed.success) redirect("/commandes?notice=invalid");
  const target = String(formData.get("target") || "/commandes");

  let notice = "updated";
  await getAdminDb().transaction(async (tx) => {
    const [order] = await tx.select({
      id: adminOrders.id, status: adminOrders.status, totalXof: adminOrders.totalXof,
      reference: adminOrders.reference, version: adminOrders.version,
    }).from(adminOrders).where(and(eq(adminOrders.id, parsed.data.orderId), isNull(adminOrders.deletedAt))).limit(1);

    if (!order) {
      notice = "missing";
      return;
    }
    const check = canTransition(order.status, parsed.data.status);
    if (!check.allowed) {
      notice = "transition";
      return;
    }

    const now = new Date();
    const milestones: Record<string, Partial<{ paidAt: Date; shippedAt: Date; deliveredAt: Date; cancelledAt: Date; refundedAt: Date; sellerPaidAt: Date }>> = {
      paid_escrow: { paidAt: now },
      shipped: { shippedAt: now },
      delivered: { deliveredAt: now },
      cancelled: { cancelledAt: now },
      refunded: { refundedAt: now },
      seller_paid: { sellerPaidAt: now },
    };
    const trackingNumber = String(formData.get("trackingNumber") || "").trim().slice(0, 120);

    const [updated] = await tx.update(adminOrders).set({
      status: parsed.data.status,
      updatedAt: now,
      version: sql`${adminOrders.version} + 1`,
      ...milestones[parsed.data.status],
      ...(trackingNumber && parsed.data.status === "shipped" ? { trackingNumber } : {}),
    })
      // Verrou optimiste : la commande doit toujours être dans l'état lu.
      .where(and(eq(adminOrders.id, order.id), eq(adminOrders.status, order.status)))
      .returning({ id: adminOrders.id });

    if (!updated) {
      notice = "conflict";
      return;
    }

    await tx.insert(adminOrderStatusHistory).values({
      id: randomUUID(), orderId: order.id, fromStatus: order.status, toStatus: parsed.data.status,
      employeeId, note: parsed.data.note, createdAt: now,
    });

    // Stock : décrément au paiement, restitution à l'annulation avant expédition.
    const lines = await tx.select({ productId: adminOrderItems.productId, quantity: adminOrderItems.quantity })
      .from(adminOrderItems).where(eq(adminOrderItems.orderId, order.id));

    if (shouldDecrementStock(parsed.data.status)) {
      for (const line of lines) {
        await tx.update(adminProducts)
          .set({ quantity: sql`greatest(0, ${adminProducts.quantity} - ${line.quantity})`, updatedAt: now })
          .where(eq(adminProducts.id, line.productId));
      }
    }
    if (shouldRestoreStock(order.status, parsed.data.status)) {
      for (const line of lines) {
        await tx.update(adminProducts)
          .set({ quantity: sql`${adminProducts.quantity} + ${line.quantity}`, updatedAt: now })
          .where(eq(adminProducts.id, line.productId));
      }
    }

    // Escrow : le vendeur devient éligible à la livraison.
    if (parsed.data.status === "delivered") {
      await tx.update(adminEscrowEntries).set({ status: "eligible" })
        .where(and(eq(adminEscrowEntries.orderId, order.id), eq(adminEscrowEntries.status, "blocked")));
    }

    // E-mail transactionnel : mis en file, jamais envoyé dans la transaction.
    const trigger = emailTriggerForTransition(order.status, parsed.data.status);
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "order.status_changed", entityType: "order", entityId: order.id,
      details: {
        from: order.status, to: parsed.data.status, note: parsed.data.note,
        emailTrigger: trigger, reference: order.reference, total: order.totalXof,
      },
    });
  });

  if (notice !== "updated") redirect(`${target}?notice=${notice}`);
  revalidateAll(parsed.data.orderId);
  redirect(`${target}?notice=updated`);
}

/** Note interne : jamais visible du client, donc séparée du statut. */
export async function saveInternalNoteAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.update");
  const parsed = z.object({
    orderId: z.string().uuid(),
    internalNote: z.string().trim().max(2000),
  }).safeParse({ orderId: formData.get("orderId"), internalNote: formData.get("internalNote") });
  if (!parsed.success) redirect("/commandes?notice=invalid");

  await getAdminDb().transaction(async (tx) => {
    const [updated] = await tx.update(adminOrders)
      .set({ internalNote: parsed.data.internalNote, updatedAt: new Date() })
      .where(and(eq(adminOrders.id, parsed.data.orderId), isNull(adminOrders.deletedAt)))
      .returning({ id: adminOrders.id });
    if (!updated) return;
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "order.note_updated", entityType: "order",
      entityId: updated.id, details: { length: parsed.data.internalNote.length },
    });
  });
  revalidateAll(parsed.data.orderId);
  redirect(`/commandes/${parsed.data.orderId}?notice=note`);
}

/**
 * Émet la facture d'une commande.
 * Le numéro est pris dans la séquence annuelle, dans la même transaction : une
 * facture ne peut jamais exister sans numéro, ni consommer un numéro sans
 * exister. Refus si une facture existe déjà (unicité métier + index en base).
 */
export async function issueInvoiceAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.documents.manage");
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) redirect("/factures?notice=invalid");

  let notice = "invoice-issued";
  const orderId = parsed.data.orderId;
  await getAdminDb().transaction(async (tx) => {
    const [order] = await tx.select({
      id: adminOrders.id, status: adminOrders.status, subtotalXof: adminOrders.subtotalXof,
      discountXof: adminOrders.discountXof, taxXof: adminOrders.taxXof, shippingCostXof: adminOrders.shippingCostXof,
      totalXof: adminOrders.totalXof, reference: adminOrders.reference, deliveryAddress: adminOrders.deliveryAddress,
    }).from(adminOrders).where(and(eq(adminOrders.id, orderId), isNull(adminOrders.deletedAt))).limit(1);

    if (!order) {
      notice = "missing";
      return;
    }
    if (order.status === "awaiting_payment" || order.status === "cancelled") {
      notice = "invoice-not-allowed";
      return;
    }

    const [existing] = await tx.select({ id: adminInvoices.id }).from(adminInvoices).where(eq(adminInvoices.orderId, order.id)).limit(1);
    if (existing) {
      notice = "invoice-exists";
      return;
    }

    const year = fiscalYearOf(new Date());
    const number = await nextDocumentNumber(tx, "invoice", year);
    const now = new Date();
    await tx.insert(adminInvoices).values({
      id: randomUUID(),
      orderId: order.id,
      invoiceNumber: number,
      status: "issued",
      subtotalXof: order.subtotalXof,
      discountXof: order.discountXof,
      shippingXof: order.shippingCostXof,
      taxXof: order.taxXof,
      totalXof: order.totalXof,
      issuedAt: now,
      createdAt: now,
      fiscalYear: year,
      sequenceNumber: Number(number.split("-").pop()),
      billingSnapshot: (order.deliveryAddress ?? {}) as Record<string, string>,
      sellerSnapshot: {},
      createdByEmployeeId: employeeId,
    });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "invoice.issued", entityType: "order", entityId: order.id,
      details: { invoiceNumber: number, total: order.totalXof, fiscalYear: year },
    });
  });

  revalidateAll(orderId);
  redirect(`/factures?notice=${notice}`);
}

/** Annule une facture (elle reste en base pour la séquence, marquée « annulée »). */
export async function voidInvoiceAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.documents.manage");
  const parsed = z.object({
    invoiceId: z.string().uuid(),
    reason: z.string().trim().min(5).max(300),
  }).safeParse({ invoiceId: formData.get("invoiceId"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/factures?notice=invalid");

  let notice = "invoice-voided";
  await getAdminDb().transaction(async (tx) => {
    const [invoice] = await tx.select({
      id: adminInvoices.id, orderId: adminInvoices.orderId, status: adminInvoices.status,
      issuedAt: adminInvoices.issuedAt, invoiceNumber: adminInvoices.invoiceNumber,
    }).from(adminInvoices).where(eq(adminInvoices.id, parsed.data.invoiceId)).limit(1);
    if (!invoice) {
      notice = "missing";
      return;
    }
    // Seule une facture réellement émise peut être annulée.
    if (invoice.status !== "issued" || !invoice.issuedAt) {
      notice = "invoice-not-voidable";
      return;
    }
    const [updated] = await tx.update(adminInvoices)
      .set({ status: "void", voidedAt: new Date(), voidReason: parsed.data.reason })
      .where(and(eq(adminInvoices.id, invoice.id), eq(adminInvoices.status, "issued")))
      .returning({ id: adminInvoices.id });
    if (!updated) {
      notice = "conflict";
      return;
    }
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "invoice.voided", entityType: "invoice", entityId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, orderId: invoice.orderId, reason: parsed.data.reason },
    });
  });

  revalidateAll();
  redirect(`/factures?notice=${notice}`);
}

/**
 * Rembourse une commande (total ou partiel).
 * Contrôlé : jamais plus que l'encaissé, jamais au-delà du reste remboursable.
 * Un avoir est émis dans la même transaction pour la comptabilité.
 */
export async function refundOrderAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.documents.manage");
  const parsed = z.object({
    orderId: z.string().uuid(),
    amountXof: z.coerce.number().int().min(1).max(1_000_000_000),
    reason: z.string().trim().min(5).max(300),
    closeOrder: z.union([z.literal("on"), z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/factures?notice=invalid");

  const orderId = parsed.data.orderId;
  let notice = "refunded";
  await getAdminDb().transaction(async (tx) => {
    const [order] = await tx.select({ id: adminOrders.id, status: adminOrders.status, reference: adminOrders.reference })
      .from(adminOrders).where(and(eq(adminOrders.id, orderId), isNull(adminOrders.deletedAt))).limit(1);
    if (!order) {
      notice = "missing";
      return;
    }

    const payments = await tx.select({ amountXof: adminPayments.amountXof, status: adminPayments.status, id: adminPayments.id })
      .from(adminPayments).where(eq(adminPayments.orderId, order.id));
    const paidXof = payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + payment.amountXof, 0);
    const refunds = await tx.select({ amountXof: adminRefunds.amountXof, status: adminRefunds.status })
      .from(adminRefunds).where(eq(adminRefunds.orderId, order.id));
    const refundedXof = refunds.filter((refund) => refund.status === "succeeded" || refund.status === "processing")
      .reduce((sum, refund) => sum + refund.amountXof, 0);

    const check = canRefund(paidXof, refundedXof, parsed.data.amountXof);
    if (!check.allowed) {
      notice = check.reason === "over_paid" ? "refund-over" : check.reason === "not_paid" ? "refund-unpaid" : "invalid";
      return;
    }

    const now = new Date();
    const year = fiscalYearOf(now);
    const [invoice] = await tx.select({ id: adminInvoices.id }).from(adminInvoices).where(eq(adminInvoices.orderId, order.id)).limit(1);

    const refundId = randomUUID();
    await tx.insert(adminRefunds).values({
      id: refundId,
      reference: await nextDocumentNumber(tx, "refund", year),
      orderId: order.id,
      paymentId: payments.find((payment) => payment.status === "succeeded")?.id ?? null,
      amountXof: parsed.data.amountXof,
      status: "processing",
      method: "original",
      reason: parsed.data.reason,
      createdByEmployeeId: employeeId,
      createdAt: now,
    });

    // Avoir comptable : numéroté dans la même transaction que le remboursement.
    await tx.insert(adminCreditNotes).values({
      id: randomUUID(),
      orderId: order.id,
      invoiceId: invoice?.id ?? null,
      creditNoteNumber: await nextDocumentNumber(tx, "credit_note", year),
      amountXof: parsed.data.amountXof,
      reason: parsed.data.reason,
      refundId,
      createdAt: now,
      fiscalYear: year,
      createdByEmployeeId: employeeId,
    });

    // Clôture de la commande si demandé et si tout est remboursé.
    if (parsed.data.closeOrder === "on" && check.remainingXof === 0) {
      const target = ["dispute", "delivered", "arrived_abidjan"].includes(order.status) ? "refunded" : order.status;
      const allowed = canTransition(order.status, target);
      if (allowed.allowed) {
        await tx.update(adminOrders).set({ status: target, refundedAt: now, updatedAt: now }).where(eq(adminOrders.id, order.id));
        await tx.insert(adminOrderStatusHistory).values({
          id: randomUUID(), orderId: order.id, fromStatus: order.status, toStatus: target,
          employeeId, note: `Remboursement intégral : ${parsed.data.reason}`, createdAt: now,
        });
      }
    }

    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "order.refunded", entityType: "order", entityId: order.id,
      details: { amount: parsed.data.amountXof, paidXof, refundedXof, reason: parsed.data.reason, remaining: check.remainingXof },
    });
  });

  revalidateAll(orderId);
  redirect(`/factures?notice=${notice}`);
}

/** Marque un remboursement comme réglé par le prestataire de paiement. */
export async function settleRefundAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.documents.manage");
  const parsed = z.object({
    refundId: z.string().uuid(),
    outcome: z.enum(["succeeded", "failed"]),
  }).safeParse({ refundId: formData.get("refundId"), outcome: formData.get("outcome") });
  if (!parsed.success) redirect("/factures?notice=invalid");

  await getAdminDb().transaction(async (tx) => {
    const [refund] = await tx.select({ id: adminRefunds.id, orderId: adminRefunds.orderId, amountXof: adminRefunds.amountXof, status: adminRefunds.status })
      .from(adminRefunds).where(eq(adminRefunds.id, parsed.data.refundId)).limit(1);
    if (!refund || refund.status !== "processing") return;
    await tx.update(adminRefunds)
      .set({ status: parsed.data.outcome, processedAt: new Date() })
      .where(and(eq(adminRefunds.id, refund.id), eq(adminRefunds.status, "processing")));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: `refund.${parsed.data.outcome}`, entityType: "refund", entityId: refund.id,
      details: { orderId: refund.orderId, amount: refund.amountXof },
    });
  });
  revalidateAll();
  redirect("/factures?notice=refund-settled");
}

/** Approuve un retour demandé par le client. */
export async function approveReturnAction(formData: FormData) {
  const { employeeId } = await requireEmployee("support.disputes.manage");
  const parsed = z.object({
    returnId: z.string().uuid(),
    internalNote: z.string().trim().max(1000).optional(),
  }).safeParse({ returnId: formData.get("returnId"), internalNote: formData.get("internalNote") });
  if (!parsed.success) redirect("/commandes/retours?notice=invalid");

  let notice = "return-approved";
  await getAdminDb().transaction(async (tx) => {
    const [request] = await tx.select({ id: adminReturnRequests.id, orderId: adminReturnRequests.orderId, status: adminReturnRequests.status })
      .from(adminReturnRequests).where(eq(adminReturnRequests.id, parsed.data.returnId)).limit(1);
    if (!request) {
      notice = "missing";
      return;
    }
    if (request.status !== "requested") {
      notice = "return-bad-status";
      return;
    }
    await tx.update(adminReturnRequests).set({
      status: "approved", approvedAt: new Date(), updatedAt: new Date(),
      handledByEmployeeId: employeeId, internalNote: parsed.data.internalNote || "",
    }).where(and(eq(adminReturnRequests.id, request.id), eq(adminReturnRequests.status, "requested")));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "return.approved", entityType: "return", entityId: request.id,
      details: { orderId: request.orderId },
    });
  });
  revalidateAll();
  redirect(`/commandes/retours?notice=${notice}`);
}

/**
 * Réceptionne un retour : remet en stock ce qui est revendable, incrémente le
 * compteur de retours des lignes, et met le montant à disposition du remboursement.
 */
export async function receiveReturnAction(formData: FormData) {
  const { employeeId } = await requireEmployee("support.disputes.manage");
  const parsed = z.object({ returnId: z.string().uuid() }).safeParse({ returnId: formData.get("returnId") });
  if (!parsed.success) redirect("/commandes/retours?notice=invalid");

  let notice = "return-received";
  await getAdminDb().transaction(async (tx) => {
    const [request] = await tx.select({
      id: adminReturnRequests.id, orderId: adminReturnRequests.orderId, status: adminReturnRequests.status,
    }).from(adminReturnRequests).where(eq(adminReturnRequests.id, parsed.data.returnId)).limit(1);
    if (!request) {
      notice = "missing";
      return;
    }
    if (request.status !== "approved") {
      notice = "return-bad-status";
      return;
    }

    const items = await tx.select({
      orderItemId: adminReturnRequestItems.orderItemId,
      quantity: adminReturnRequestItems.quantity,
      restock: adminReturnRequestItems.restock,
    }).from(adminReturnRequestItems).where(eq(adminReturnRequestItems.returnRequestId, request.id));

    const now = new Date();
    for (const item of items) {
      const [orderItem] = await tx.select({ productId: adminOrderItems.productId, returnedQuantity: adminOrderItems.returnedQuantity })
        .from(adminOrderItems).where(eq(adminOrderItems.id, item.orderItemId)).limit(1);
      if (!orderItem) continue;
      await tx.update(adminOrderItems)
        .set({ returnedQuantity: sql`${adminOrderItems.returnedQuantity} + ${item.quantity}` })
        .where(eq(adminOrderItems.id, item.orderItemId));
      if (item.restock) {
        await tx.update(adminProducts)
          .set({ quantity: sql`${adminProducts.quantity} + ${item.quantity}`, updatedAt: now })
          .where(eq(adminProducts.id, orderItem.productId));
      }
    }

    await tx.update(adminReturnRequests).set({ status: "received", receivedAt: now, updatedAt: now })
      .where(and(eq(adminReturnRequests.id, request.id), eq(adminReturnRequests.status, "approved")));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "return.received", entityType: "return", entityId: request.id,
      details: { orderId: request.orderId, lines: items.length, restocked: items.filter((item) => item.restock).length },
    });
  });
  revalidateAll();
  redirect(`/commandes/retours?notice=${notice}`);
}

/** Refuse un retour, avec motif obligatoire. */
export async function refuseReturnAction(formData: FormData) {
  const { employeeId } = await requireEmployee("support.disputes.manage");
  const parsed = z.object({
    returnId: z.string().uuid(),
    internalNote: z.string().trim().min(5).max(1000),
  }).safeParse({ returnId: formData.get("returnId"), internalNote: formData.get("internalNote") });
  if (!parsed.success) redirect("/commandes/retours?notice=invalid");

  let notice = "return-refused";
  await getAdminDb().transaction(async (tx) => {
    const [request] = await tx.select({ id: adminReturnRequests.id, orderId: adminReturnRequests.orderId, status: adminReturnRequests.status })
      .from(adminReturnRequests).where(eq(adminReturnRequests.id, parsed.data.returnId)).limit(1);
    if (!request) {
      notice = "missing";
      return;
    }
    if (!["requested", "approved"].includes(request.status)) {
      notice = "return-bad-status";
      return;
    }
    await tx.update(adminReturnRequests).set({
      status: "refused", refusedAt: new Date(), updatedAt: new Date(),
      handledByEmployeeId: employeeId, internalNote: parsed.data.internalNote,
    }).where(eq(adminReturnRequests.id, request.id));
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "return.refused", entityType: "return", entityId: request.id,
      details: { orderId: request.orderId, reason: parsed.data.internalNote },
    });
  });
  revalidateAll();
  redirect(`/commandes/retours?notice=${notice}`);
}

/** Paie le vendeur : seulement après livraison effective. */
export async function paySellerAction(formData: FormData) {
  const { employeeId } = await requireEmployee("orders.status.update");
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) redirect("/commandes?notice=invalid");

  let notice = "seller-paid";
  await getAdminDb().transaction(async (tx) => {
    const [order] = await tx.select({ id: adminOrders.id, status: adminOrders.status, deliveredAt: adminOrders.deliveredAt })
      .from(adminOrders).where(and(eq(adminOrders.id, parsed.data.orderId), isNull(adminOrders.deletedAt))).limit(1);
    if (!order) {
      notice = "missing";
      return;
    }
    if (!canPaySeller({ status: order.status, deliveredAt: order.deliveredAt })) {
      notice = "seller-not-eligible";
      return;
    }
    const now = new Date();
    const [updated] = await tx.update(adminOrders)
      .set({ status: "seller_paid", sellerPaidAt: now, updatedAt: now, version: sql`${adminOrders.version} + 1` })
      .where(and(eq(adminOrders.id, order.id), eq(adminOrders.status, "delivered")))
      .returning({ id: adminOrders.id });
    if (!updated) {
      notice = "conflict";
      return;
    }
    await tx.update(adminEscrowEntries).set({ status: "released", releasedAt: now })
      .where(and(eq(adminEscrowEntries.orderId, order.id), eq(adminEscrowEntries.status, "eligible")));
    await tx.insert(adminOrderStatusHistory).values({
      id: randomUUID(), orderId: order.id, fromStatus: "delivered", toStatus: "seller_paid",
      employeeId, note: "Vendeur réglé après livraison", createdAt: now,
    });
    await tx.insert(employeeAuditLogs).values({
      actorEmployeeId: employeeId, action: "order.seller_paid", entityType: "order", entityId: order.id,
      details: { status: ORDER_STATUS_LABELS.seller_paid },
    });
  });
  revalidateAll(parsed.data.orderId);
  redirect(`/commandes?notice=${notice}`);
}
