import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeft, CreditCard, PackageCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import {
  adminCreditNotes,
  adminEscrowEntries,
  adminInvoices,
  adminOrderItems,
  adminOrderStatusHistory,
  adminOrders,
  adminPayments,
  adminRefunds,
  adminUsers,
  employeeAuditLogs,
} from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { canPaySeller, nextStatuses, ORDER_STATUS_LABELS } from "@/lib/order-rules";
import { changeOrderStatusAction, paySellerAction, saveInternalNoteAction } from "../actions";

export const dynamic = "force-dynamic";

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const dateTime = (date: Date | null) => (date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—");

const notices: Record<string, string> = {
  updated: "Statut mis à jour.",
  transition: "Transition refusée : ce saut n'est pas autorisé.",
  conflict: "La commande a changé entre-temps : recharge la page.",
  invalid: "Formulaire invalide.",
  note: "Note interne enregistrée.",
  "seller-paid": "Vendeur réglé.",
  "seller-not-eligible": "Le vendeur ne peut être réglé qu'après livraison.",
};

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("orders.read");
  const { id } = await params;
  const { notice } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const db = getAdminDb();
  const [order] = await db.select({
    id: adminOrders.id,
    reference: adminOrders.reference,
    status: adminOrders.status,
    subtotalXof: adminOrders.subtotalXof,
    discountXof: adminOrders.discountXof,
    taxXof: adminOrders.taxXof,
    shippingCostXof: adminOrders.shippingCostXof,
    totalXof: adminOrders.totalXof,
    shippingMode: adminOrders.shippingMode,
    trackingNumber: adminOrders.trackingNumber,
    internalNote: adminOrders.internalNote,
    deliveryMethod: adminOrders.deliveryMethod,
    deliveryAddress: adminOrders.deliveryAddress,
    paymentExpiresAt: adminOrders.paymentExpiresAt,
    paidAt: adminOrders.paidAt,
    shippedAt: adminOrders.shippedAt,
    deliveredAt: adminOrders.deliveredAt,
    cancelledAt: adminOrders.cancelledAt,
    refundedAt: adminOrders.refundedAt,
    sellerPaidAt: adminOrders.sellerPaidAt,
    createdAt: adminOrders.createdAt,
    locale: adminOrders.locale,
    customerName: adminUsers.name,
    customerEmail: adminUsers.email,
    customerPhone: adminUsers.phone,
  }).from(adminOrders).leftJoin(adminUsers, eq(adminOrders.buyerId, adminUsers.id))
    .where(and(eq(adminOrders.id, id), isNull(adminOrders.deletedAt))).limit(1);

  if (!order) notFound();

  const [items, history, payments, invoice, escrow, refunds, creditNotes, audit] = await Promise.all([
    db.select().from(adminOrderItems).where(eq(adminOrderItems.orderId, order.id)).orderBy(asc(adminOrderItems.id)),
    db.select().from(adminOrderStatusHistory).where(eq(adminOrderStatusHistory.orderId, order.id)).orderBy(desc(adminOrderStatusHistory.createdAt)).limit(30),
    db.select().from(adminPayments).where(eq(adminPayments.orderId, order.id)).orderBy(desc(adminPayments.createdAt)),
    db.select().from(adminInvoices).where(eq(adminInvoices.orderId, order.id)).limit(1),
    db.select().from(adminEscrowEntries).where(eq(adminEscrowEntries.orderId, order.id)).limit(1),
    db.select().from(adminRefunds).where(eq(adminRefunds.orderId, order.id)).orderBy(desc(adminRefunds.createdAt)),
    db.select().from(adminCreditNotes).where(eq(adminCreditNotes.orderId, order.id)).orderBy(desc(adminCreditNotes.createdAt)),
    db.select({ action: employeeAuditLogs.action, createdAt: employeeAuditLogs.createdAt, details: employeeAuditLogs.details })
      .from(employeeAuditLogs)
      .where(and(eq(employeeAuditLogs.entityType, "order"), eq(employeeAuditLogs.entityId, order.id)))
      .orderBy(desc(employeeAuditLogs.createdAt)).limit(20),
  ]);

  const paidXof = payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + payment.amountXof, 0);
  const refundedXof = refunds.filter((refund) => refund.status === "succeeded").reduce((sum, refund) => sum + refund.amountXof, 0);
  const pendingRefunds = refunds.filter((refund) => refund.status === "processing").reduce((sum, refund) => sum + refund.amountXof, 0);
  const allowed = nextStatuses(order.status);
  const address = order.deliveryAddress || {};
  const sellerPayable = canPaySeller({ status: order.status, deliveredAt: order.deliveredAt });

  return <>
    <div className="admin-breadcrumb"><span>Ventes</span><span>/</span><Link href="/commandes" className="hover:underline">Commandes</Link><span>/</span><strong>{order.reference || order.id.slice(0, 8)}</strong></div>
    <div className="admin-page-title-row">
      <div>
        <h1 className="admin-page-title">Commande {order.reference || order.id.slice(0, 8)}</h1>
        <p className="admin-page-subtitle">{ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] || order.status} · créée le {dateTime(order.createdAt)} · {order.locale}</p>
      </div>
      <Link href="/commandes" className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={14}/>Retour</Link>
    </div>

    {notice && notices[notice] && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.includes("refus") || notice.includes("invalide") || notice.includes("changé") ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role="status">{notices[notice]}</p>}

    <div className="mb-5 grid gap-4 sm:grid-cols-4">
      <Card className="p-4"><div className="text-xs text-slate-500">Total commandé</div><strong className="text-lg">{money(order.totalXof)}</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Encaissé</div><strong className="text-lg">{money(paidXof)}</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Remboursé</div><strong className="text-lg">{money(refundedXof)}</strong>{pendingRefunds > 0 && <div className="text-[11px] text-amber-700">{money(pendingRefunds)} en cours</div>}</Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Séquestre</div><strong className="text-sm">{escrow[0]?.status || "aucun"}</strong>{escrow[0]?.releasedAt && <div className="text-[11px] text-slate-500">libéré le {dateTime(escrow[0].releasedAt)}</div>}</Card>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-3">
      <Card className="overflow-hidden xl:col-span-2">
        <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-bold text-slate-950"><PackageCheck size={17}/>Articles commandés</h2><p className="text-xs text-slate-500">{items.length} ligne(s) · prix et taxes figés à la commande</p></div>
        {items.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[760px]">
          <thead><tr><th>Article</th><th>Qté</th><th>Prix unitaire</th><th>TVA</th><th>Retourné</th><th>Total ligne</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td><div className="font-semibold text-slate-900">{item.productTitle}</div><div className="text-[11px] text-slate-500">{item.productSku || "sans SKU"}{Object.keys(item.variantSnapshot || {}).length ? ` · ${Object.entries(item.variantSnapshot).map(([key, value]) => `${key}: ${value}`).join(", ")}` : ""}</div></td>
            <td>{item.quantity}</td>
            <td className="whitespace-nowrap">{money(item.unitPriceXof)}</td>
            <td className="text-xs">{Number(item.taxRatePercent)} %</td>
            <td className="text-xs">{item.returnedQuantity > 0 ? <span className="font-semibold text-amber-800">{item.returnedQuantity}</span> : "—"}</td>
            <td className="whitespace-nowrap font-semibold">{money(item.lineTotalXof || item.unitPriceXof * item.quantity)}</td>
          </tr>)}</tbody>
        </table></div> : <div className="admin-empty"><strong>Aucun article</strong>Cette commande ne contient aucune ligne.</div>}
        <div className="grid gap-1 border-t border-slate-100 p-4 text-sm sm:max-w-sm sm:ml-auto">
          <div className="flex justify-between"><span className="text-slate-500">Sous-total</span><span>{money(order.subtotalXof)}</span></div>
          {order.discountXof > 0 && <div className="flex justify-between text-emerald-700"><span>Remise</span><span>−{money(order.discountXof)}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">Port</span><span>{money(order.shippingCostXof)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">TVA</span><span>{money(order.taxXof)}</span></div>
          <div className="mt-1 flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><span>Total</span><span>{money(order.totalXof)}</span></div>
        </div>
      </Card>

      <div className="grid gap-5">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Faire avancer la commande</h2><p className="text-xs text-slate-500">Seules les transitions autorisées sont proposées.</p></div>
          <div className="grid gap-3 p-5">
            {allowed.length ? allowed.map((target) => <form key={target} action={changeOrderStatusAction} className="grid gap-2 rounded-lg border border-slate-200 p-3">
              <input type="hidden" name="orderId" value={order.id}/>
              <input type="hidden" name="status" value={target}/>
              <input type="hidden" name="target" value={`/commandes/${order.id}`}/>
              <div className="text-xs font-semibold text-slate-800">→ {ORDER_STATUS_LABELS[target]}</div>
              {target === "shipped" && <input name="trackingNumber" maxLength={120} className="ui-input" placeholder="Numéro de suivi (facultatif)"/>}
              <input name="note" required minLength={3} maxLength={300} className="ui-input" placeholder="Motif ou précision obligatoire"/>
              <button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 text-xs font-semibold text-white hover:bg-slate-800">Appliquer</button>
            </form>) : <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Statut terminal : plus aucune transition n&apos;est possible.</p>}
            {sellerPayable && <form action={paySellerAction}><input type="hidden" name="orderId" value={order.id}/><button type="submit" className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">Régler le vendeur (libérer le séquestre)</button></form>}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Client et livraison</h2></div>
          <div className="grid gap-2 p-5 text-sm">
            <div className="font-semibold text-slate-900">{order.customerName || "Client supprimé"}</div>
            <div className="text-xs text-slate-500">{order.customerEmail}</div>
            <div className="text-xs text-slate-500">{order.customerPhone || "téléphone non renseigné"}</div>
            <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              {Object.keys(address).length ? <>
                <div className="font-semibold">{address.firstName} {address.lastName}</div>
                <div>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</div>
                <div>{address.city}{address.region ? `, ${address.region}` : ""} · {address.countryCode}</div>
                {address.phone && <div>{address.phone}</div>}
              </> : "Adresse recopiée indisponible"}
            </div>
            <div className="text-xs text-slate-500">Mode : {order.deliveryMethod === "pickup" ? "Retrait" : "Livraison"} · {order.shippingMode === "air" ? "Avion" : order.shippingMode === "sea" ? "Bateau" : "non choisi"}</div>
            {order.trackingNumber && <div className="text-xs text-slate-500">Suivi : {order.trackingNumber}</div>}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Jalons</h2></div>
          <div className="grid gap-1.5 p-5 text-xs">
            {([
              { label: "Payée", value: order.paidAt },
              { label: "Expédiée", value: order.shippedAt },
              { label: "Livrée", value: order.deliveredAt },
              { label: "Annulée", value: order.cancelledAt },
              { label: "Remboursée", value: order.refundedAt },
              { label: "Vendeur payé", value: order.sellerPaidAt },
            ]).map((milestone) => <div key={milestone.label} className="flex justify-between gap-3"><span className="text-slate-500">{milestone.label}</span><span className={milestone.value ? "font-semibold text-slate-900" : "text-slate-400"}>{dateTime(milestone.value)}</span></div>)}
            {order.status === "awaiting_payment" && order.paymentExpiresAt && <div className="mt-2 rounded bg-amber-50 p-2 text-amber-800">Paiement attendu avant le {dateTime(order.paymentExpiresAt)}</div>}
          </div>
        </Card>
      </div>
    </div>

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-3">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="flex items-center gap-2 font-bold text-slate-950"><CreditCard size={17}/>Paiements</h2></div>
        {payments.length ? <div className="divide-y divide-slate-100">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between p-4 text-xs">
          <div><div className="font-semibold text-slate-900">{money(payment.amountXof)} · {payment.method}</div><div className="text-slate-500">{payment.provider} · {dateTime(payment.createdAt)}</div></div>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${payment.status === "succeeded" ? "bg-emerald-50 text-emerald-800" : payment.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{payment.status}</span>
        </div>)}</div> : <div className="admin-empty"><strong>Aucun paiement</strong>Cette commande n&apos;a pas encore été réglée.</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Documents</h2></div>
        <div className="grid gap-2 p-5 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Facture</span><span className="font-semibold">{invoice[0] ? `${invoice[0].invoiceNumber} (${invoice[0].status})` : "non émise"}</span></div>
          {creditNotes.map((note) => <div key={note.id} className="flex justify-between"><span className="text-slate-500">Avoir</span><span className="font-semibold">{note.creditNoteNumber} · {money(note.amountXof)}</span></div>)}
          {refunds.map((refund) => <div key={refund.id} className="flex justify-between"><span className="text-slate-500">Remboursement</span><span className="font-semibold">{money(refund.amountXof)} · {refund.status}</span></div>)}
          {!invoice[0] && <Link href="/factures" className="mt-2 text-xs font-semibold text-orange-700 hover:underline">Émettre la facture depuis l&apos;écran Factures</Link>}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Note interne</h2><p className="text-xs text-slate-500">Jamais visible du client.</p></div>
        <form action={saveInternalNoteAction} className="grid gap-2 p-5">
          <input type="hidden" name="orderId" value={order.id}/>
          <textarea name="internalNote" maxLength={2000} rows={3} defaultValue={order.internalNote} className="ui-input min-h-24 resize-y" placeholder="Contexte, accord commercial, échange téléphonique…"/>
          <button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">Enregistrer</button>
        </form>
      </Card>
    </div>

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Historique des statuts</h2><p className="text-xs text-slate-500">Chaque passage est motivé et horodaté.</p></div>
        {history.length ? <div className="divide-y divide-slate-100">{history.map((entry) => <div key={entry.id} className="p-4 text-xs">
          <div className="font-semibold text-slate-900">{entry.fromStatus ? `${ORDER_STATUS_LABELS[entry.fromStatus as keyof typeof ORDER_STATUS_LABELS] || entry.fromStatus} → ` : ""}{ORDER_STATUS_LABELS[entry.toStatus as keyof typeof ORDER_STATUS_LABELS] || entry.toStatus}</div>
          <div className="text-slate-500">{dateTime(entry.createdAt)}</div>
          {entry.note && <div className="mt-1 text-slate-700">{entry.note}</div>}
        </div>)}</div> : <div className="admin-empty"><strong>Aucun historique</strong>Les changements de statut apparaîtront ici.</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Journal d&apos;audit</h2><p className="text-xs text-slate-500">Traces techniques des actions employés.</p></div>
        {audit.length ? <div className="divide-y divide-slate-100">{audit.map((entry, index) => <div key={index} className="p-4 text-xs">
          <div className="font-semibold text-slate-900">{entry.action}</div>
          <div className="text-slate-500">{dateTime(entry.createdAt)}</div>
        </div>)}</div> : <div className="admin-empty"><strong>Aucune action tracée</strong>Le journal se remplit à chaque opération.</div>}
      </Card>
    </div>

    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Les montants affichés proviennent de la commande, pas d&apos;un recalcul : une facture émise et une commande passée ne changent jamais rétroactivement, même si le catalogue évolue.</span></p>
  </>;
}
