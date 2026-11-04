"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { adminAuditLog, escrowEntries, orderEvents, orderItems, orders, payments, platformSettings, products, sellerProfiles, users } from "@/lib/db/schema";
import type { FormState } from "@/actions/seller";
import { releaseOrderStock } from "@/lib/stock-ledger";

async function adminContext() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Accès administrateur requis.");
  const db=getDb();
  const [current]=await db.select({id:users.id,role:users.role}).from(users).where(eq(users.id,session.user.id)).limit(1);
  if (!current || current.role !== "admin") throw new Error("Accès administrateur requis.");
  return current;
}

async function audit(actorId: string, action: string, type: string, entityId: string, details: Record<string, unknown> = {}) {
  const db = getDb();
  await db.insert(adminAuditLog).values({ actorUserId: actorId, action, entityType: type, entityId, details });
}

/**
 * Suspension d'un compte vendeur.
 * La suspension est écrite en base (`users.status`) : toutes les lectures publiques
 * (catalogue, boutique, messagerie, devis) et `requireUser` la prennent en compte,
 * ce qui coupe l'accès aux pages protégées dès la requête suivante.
 */
export async function suspendSeller(profileId: string, reason: string): Promise<FormState> {
  const admin = await adminContext();
  const db = getDb();
  const [profile] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.id, profileId)).limit(1);
  if (!profile) return { error: "Profil vendeur introuvable." };
  const note = reason.trim();
  if (note.length < 5) return { error: "Indiquez un motif de suspension (5 caractères minimum)." };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(sellerProfiles).set({ verificationStatus: "suspended", updatedAt: now }).where(eq(sellerProfiles.id, profileId));
    await tx.update(users).set({ status: "suspended", updatedAt: now }).where(eq(users.id, profile.userId));
    await tx.insert(adminAuditLog).values({ actorUserId: admin.id, action: "seller_suspended", entityType: "seller_profile", entityId: profileId, details: { reason: note } });
  });
  return { success: "Vendeur suspendu : son catalogue n’est plus visible et son compte est bloqué." };
}

export async function reviewSeller(profileId: string, decision: "approved" | "rejected"): Promise<FormState> {
  const admin = await adminContext();
  const db = getDb();
  const [profile] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.id, profileId)).limit(1);
  if (!profile) return { error: "Profil vendeur introuvable." };
  await db.update(sellerProfiles).set({ verificationStatus: decision, updatedAt: new Date() }).where(eq(sellerProfiles.id, profileId));
  await audit(admin.id, `seller_${decision}`, "seller_profile", profileId, { sellerUserId: profile.userId });
  return { success: decision === "approved" ? "Vendeur vérifié." : "Demande vendeur refusée." };
}

export async function reviewProduct(productId: string, decision: "approved" | "rejected"): Promise<FormState> {
  const admin = await adminContext();
  const db = getDb();
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return { error: "Produit introuvable." };
  if (decision === "approved") {
    const [seller] = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, product.sellerId)).limit(1);
    if (!seller || seller.verificationStatus !== "approved") return { error: "Le vendeur doit être vérifié avant le produit." };
  }
  await db.update(products).set({ status: decision, updatedAt: new Date() }).where(eq(products.id, productId));
  await audit(admin.id, `product_${decision}`, "product", productId, { sellerId: product.sellerId });
  return { success: decision === "approved" ? "Produit publié." : "Produit refusé." };
}

export async function updateCommissionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const admin = await adminContext();
  const raw = Number(formData.get("commissionPercent"));
  if (!Number.isFinite(raw) || raw < 0 || raw > 20) return { error: "La commission doit être comprise entre 0 et 20 %." };
  const bps = Math.round(raw * 100);
  const db = getDb();
  await db.insert(platformSettings).values({ key: "commission_bps", value: String(bps), updatedBy: admin.id, updatedAt: new Date() }).onConflictDoUpdate({ target: platformSettings.key, set: { value: String(bps), updatedBy: admin.id, updatedAt: new Date() } });
  await audit(admin.id, "commission_updated", "platform_setting", "commission_bps", { bps });
  return { success: `Commission mise à jour : ${(bps / 100).toFixed(2)} %.` };
}

export async function prepareEscrowRelease(entryId: string): Promise<FormState> {
  const admin = await adminContext();
  const db = getDb();
  const [entry] = await db.select().from(escrowEntries).where(eq(escrowEntries.id, entryId)).limit(1);
  if (!entry || entry.status !== "eligible") return { error: "Seul un ledger éligible peut être soumis à libération." };
  const [order] = await db.select().from(orders).where(eq(orders.id, entry.orderId)).limit(1);
  if (!order || order.status !== "delivered") return { error: "La livraison doit être confirmée avant le règlement vendeur." };
  await db.update(escrowEntries).set({ status: "release_pending" }).where(and(eq(escrowEntries.id, entry.id), eq(escrowEntries.status, "eligible")));
  await audit(admin.id, "escrow_release_requested", "escrow", entry.id, { orderId: order.id, amountXof: entry.sellerNetXof });
  return { success: "Demande de transfert préparée. Aucun fonds n’a été transféré : connectez le PSP pour terminer le règlement." };
}

export async function prepareEscrowRefund(entryId: string): Promise<FormState> {
  const admin = await adminContext();
  const db = getDb();
  const [entry] = await db.select().from(escrowEntries).where(eq(escrowEntries.id, entryId)).limit(1);
  if (!entry || !["blocked", "eligible"].includes(entry.status)) return { error: "Ce ledger ne peut pas être remboursé dans son état actuel." };
  await db.update(escrowEntries).set({ status: "refund_pending" }).where(eq(escrowEntries.id, entry.id));
  await audit(admin.id, "escrow_refund_requested", "escrow", entry.id, { orderId: entry.orderId, amountXof: entry.amountXof });
  return { success: "Remboursement en attente. Aucun fonds n’a été remboursé : connectez le PSP pour effectuer l’opération." };
}

const transitions: Record<string, string[]> = {
  paid_escrow: ["seller_confirmed", "cancelled", "dispute"],
  seller_confirmed: ["received_collection_point", "dispute"],
  received_collection_point: ["shipped", "dispute"],
  shipped: ["arrived_abidjan", "dispute"],
  arrived_abidjan: ["out_for_delivery", "delivered", "dispute"],
  out_for_delivery: ["delivered", "dispute"],
  dispute: ["refunded", "delivered"],
};

export async function adminChangeOrderStatus(orderId: string, status: string, note: string): Promise<FormState> {
  const admin = await adminContext();
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { error: "Commande introuvable." };
  if (!transitions[order.status]?.includes(status)) return { error: "Cette transition de statut n’est pas autorisée." };
  const next = status as typeof order.status;
  const now = new Date();
  await db.update(orders).set({ status: next, updatedAt: now }).where(eq(orders.id, order.id));
  await db.insert(orderEvents).values({ orderId: order.id, status: next, actorUserId: admin.id, note: note.trim() || "Mise à jour par l’administration." });
  if (next === "delivered") await db.update(escrowEntries).set({ status: "eligible" }).where(and(eq(escrowEntries.orderId, order.id), eq(escrowEntries.status, "blocked")));
  if (next === "refunded" || next === "cancelled") await db.update(escrowEntries).set({ status: "refund_pending" }).where(and(eq(escrowEntries.orderId, order.id), eq(escrowEntries.status, "blocked")));
  if (next === "cancelled") {
    // Libère la réservation de stock de la commande (grand livre), ou restitue le stock d'une commande ancienne.
    await db.transaction(async (tx) => {
      const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      await releaseOrderStock(tx, { orderId: order.id, lines: lines.map((line) => ({ productId: line.productId, variantId: null, quantity: line.quantity })), note: "Commande annulée par l'administration." });
    });
    await db.update(payments).set({status:"cancelled"}).where(and(eq(payments.orderId,order.id),eq(payments.status,"pending")));
  }
  await audit(admin.id, "order_status_changed", "order", order.id, { from: order.status, to: next, note: note.trim() });
  return { success: `Commande mise à jour : ${next}.` };
}

export async function confirmDelivery(orderId: string): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Connectez-vous pour confirmer la réception." };
  const db = getDb();
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.buyerId, session.user.id))).limit(1);
  if (!order || !["arrived_abidjan", "out_for_delivery"].includes(order.status)) return { error: "Cette commande ne peut pas encore être confirmée comme livrée." };
  const now = new Date();
  await db.update(orders).set({ status: "delivered", updatedAt: now }).where(eq(orders.id, order.id));
  await db.insert(orderEvents).values({ orderId: order.id, status: "delivered", actorUserId: session.user.id, note: "Livraison confirmée par l’acheteur." });
  await db.update(escrowEntries).set({ status: "eligible" }).where(and(eq(escrowEntries.orderId, order.id), eq(escrowEntries.status, "blocked")));
  return { success: "Réception confirmée. Les fonds sont maintenant éligibles à la libération, après contrôle." };
}
