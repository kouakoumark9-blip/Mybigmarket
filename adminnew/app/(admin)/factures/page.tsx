import { and, desc, eq, isNull } from "drizzle-orm";
import { Ban, FileText, Receipt, TriangleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import {
  adminCreditNotes,
  adminInvoices,
  adminOrders,
  adminPayments,
  adminRefunds,
} from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { issueInvoiceAction, refundOrderAction, settleRefundAction, voidInvoiceAction } from "../commandes/actions";

export const dynamic = "force-dynamic";

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const dateLabel = (date: Date | null) => (date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "—");

const notices: Record<string, { tone: string; text: string }> = {
  "invoice-issued": { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Facture émise avec un numéro de séquence définitif." },
  "invoice-exists": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Une facture existe déjà pour cette commande : une seule facture par commande." },
  "invoice-not-allowed": { tone: "border-red-200 bg-red-50 text-red-800", text: "Facturation refusée : la commande n'est pas payée, ou elle est annulée." },
  "invoice-voided": { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Facture annulée. Son numéro reste réservé : la séquence ne comporte pas de trou." },
  "invoice-not-voidable": { tone: "border-red-200 bg-red-50 text-red-800", text: "Seule une facture émise peut être annulée." },
  refunded: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Remboursement enregistré et avoir émis." },
  "refund-over": { tone: "border-red-200 bg-red-50 text-red-800", text: "Remboursement refusé : le montant dépasse le reste remboursable." },
  "refund-unpaid": { tone: "border-red-200 bg-red-50 text-red-800", text: "Remboursement refusé : aucun paiement encaissé sur cette commande." },
  "refund-settled": { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Statut du remboursement mis à jour." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Élément introuvable." },
  conflict: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "La facture a changé entre-temps : recharge la page." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : montant et motif obligatoires." },
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("orders.documents.manage");
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const db = getAdminDb();

  const [invoices, billableOrders, refunds, creditNotes, payments] = await Promise.all([
    db.select({
      id: adminInvoices.id,
      number: adminInvoices.invoiceNumber,
      status: adminInvoices.status,
      orderId: adminInvoices.orderId,
      subtotalXof: adminInvoices.subtotalXof,
      taxXof: adminInvoices.taxXof,
      totalXof: adminInvoices.totalXof,
      issuedAt: adminInvoices.issuedAt,
      voidedAt: adminInvoices.voidedAt,
      fiscalYear: adminInvoices.fiscalYear,
      orderReference: adminOrders.reference,
    })
      .from(adminInvoices)
      .leftJoin(adminOrders, eq(adminInvoices.orderId, adminOrders.id))
      .orderBy(desc(adminInvoices.createdAt))
      .limit(100),
    db.select({
      id: adminOrders.id,
      reference: adminOrders.reference,
      status: adminOrders.status,
      totalXof: adminOrders.totalXof,
      createdAt: adminOrders.createdAt,
    })
      .from(adminOrders)
      .leftJoin(adminInvoices, eq(adminInvoices.orderId, adminOrders.id))
      .where(and(isNull(adminInvoices.id), isNull(adminOrders.deletedAt)))
      .orderBy(desc(adminOrders.createdAt))
      .limit(50),
    db.select({
      id: adminRefunds.id,
      reference: adminRefunds.reference,
      orderId: adminRefunds.orderId,
      amountXof: adminRefunds.amountXof,
      status: adminRefunds.status,
      reason: adminRefunds.reason,
      createdAt: adminRefunds.createdAt,
    }).from(adminRefunds).orderBy(desc(adminRefunds.createdAt)).limit(50),
    db.select({
      id: adminCreditNotes.id,
      number: adminCreditNotes.creditNoteNumber,
      orderId: adminCreditNotes.orderId,
      amountXof: adminCreditNotes.amountXof,
      reason: adminCreditNotes.reason,
      createdAt: adminCreditNotes.createdAt,
    }).from(adminCreditNotes).orderBy(desc(adminCreditNotes.createdAt)).limit(50),
    db.select({ orderId: adminPayments.orderId, amountXof: adminPayments.amountXof, status: adminPayments.status }).from(adminPayments),
  ]);

  const paidByOrder = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "succeeded") continue;
    paidByOrder.set(payment.orderId, (paidByOrder.get(payment.orderId) ?? 0) + payment.amountXof);
  }
  const refundedByOrder = new Map<string, number>();
  for (const refund of refunds) {
    if (refund.status !== "succeeded" && refund.status !== "processing") continue;
    refundedByOrder.set(refund.orderId, (refundedByOrder.get(refund.orderId) ?? 0) + refund.amountXof);
  }

  const issuedTotal = invoices.filter((invoice) => invoice.status === "issued").reduce((sum, invoice) => sum + invoice.totalXof, 0);
  const pendingRefunds = refunds.filter((refund) => refund.status === "processing");

  return <>
    <div className="admin-breadcrumb"><span>Ventes</span><span>/</span><strong>Factures et avoirs</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Factures, avoirs et remboursements</h1><p className="admin-page-subtitle">Numérotation continue, facture émise immuable, remboursement plafonné à l&apos;encaissé.</p></div>
      <Link href="/commandes" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Retour aux commandes</Link>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Card className="flex items-center gap-3 p-4"><FileText size={19} className="text-slate-600"/><div><div className="text-xs text-slate-500">Factures émises</div><strong className="text-lg">{invoices.filter((invoice) => invoice.status === "issued").length}</strong></div></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Montant facturé</div><strong className="text-lg">{money(issuedTotal)}</strong></Card>
      <Card className="flex items-center gap-3 p-4"><Undo2 size={19} className="text-amber-600"/><div><div className="text-xs text-slate-500">Remboursements en cours</div><strong className="text-lg">{pendingRefunds.length}</strong></div></Card>
    </div>

    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Émettre une facture</h2><p className="text-xs text-slate-500">Le numéro est attribué définitivement à l&apos;émission. Une facture ne se régénère jamais.</p></div>
      {billableOrders.length ? <div className="divide-y divide-slate-100">{billableOrders.map((order) => <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><div className="font-semibold text-slate-900">{order.reference || order.id.slice(0, 8)}</div><div className="text-[11px] text-slate-500">{dateLabel(order.createdAt)} · {money(order.totalXof)} · statut {order.status}</div></div>
        <form action={issueInvoiceAction}><input type="hidden" name="orderId" value={order.id}/><button type="submit" className="inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800">Émettre la facture</button></form>
      </div>)}</div> : <div className="admin-empty"><strong>Aucune commande à facturer</strong>Toutes les commandes éligibles ont déjà leur facture.</div>}
    </Card>

    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Factures</h2><p className="text-xs text-slate-500">{invoices.length} document(s) — 100 plus récents</p></div>
      {invoices.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[980px]">
        <thead><tr><th>Numéro</th><th>Commande</th><th>Montants</th><th>Émise le</th><th>Statut</th><th className="text-right">Action</th></tr></thead>
        <tbody>{invoices.map((invoice) => <tr key={invoice.id}>
          <td><div className="font-semibold text-slate-900">{invoice.number}</div><div className="text-[11px] text-slate-500">exercice {invoice.fiscalYear ?? "—"}</div></td>
          <td className="text-xs"><Link href={`/commandes/${invoice.orderId}`} className="font-semibold text-orange-700 hover:underline">{invoice.orderReference || invoice.orderId.slice(0, 8)}</Link></td>
          <td className="text-xs">HT {money(invoice.subtotalXof)}<br/>TVA {money(invoice.taxXof)}<br/><span className="font-semibold">TTC {money(invoice.totalXof)}</span></td>
          <td className="whitespace-nowrap text-xs">{dateLabel(invoice.issuedAt)}</td>
          <td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${invoice.status === "issued" ? "bg-emerald-50 text-emerald-800" : invoice.status === "void" ? "bg-red-50 text-red-800" : "bg-slate-100 text-slate-600"}`}>{invoice.status === "issued" ? "Émise" : invoice.status === "void" ? "Annulée" : "Brouillon"}</span></td>
          <td className="text-right">{invoice.status === "issued" ? <form action={voidInvoiceAction} className="flex items-center justify-end gap-2"><input type="hidden" name="invoiceId" value={invoice.id}/><input name="reason" required minLength={5} maxLength={300} className="ui-input max-w-48" placeholder="Motif d'annulation"/><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"><Ban size={13}/>Annuler</button></form> : <span className="text-[11px] text-slate-400">—</span>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Receipt size={24} className="mb-2 text-slate-400"/><strong>Aucune facture</strong>Émets une facture depuis la liste des commandes facturables ci-dessus.</div>}
    </Card>

    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Remboursements</h2><p className="text-xs text-slate-500">Montant plafonné au reste remboursable de chaque commande.</p></div>
        {refunds.length ? <div className="divide-y divide-slate-100">{refunds.map((refund) => {
          const paid = paidByOrder.get(refund.orderId) ?? 0;
          const refunded = refundedByOrder.get(refund.orderId) ?? 0;
          return <div key={refund.id} className="grid gap-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div><div className="text-sm font-semibold text-slate-900">{money(refund.amountXof)} · {refund.reference}</div><div className="text-[11px] text-slate-500">commande {refund.orderId.slice(0, 8)} · encaissé {money(paid)} · déjà remboursé {money(refunded)}</div></div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${refund.status === "succeeded" ? "bg-emerald-50 text-emerald-800" : refund.status === "processing" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{refund.status}</span>
            </div>
            <div className="text-xs text-slate-600">{refund.reason}</div>
            {refund.status === "processing" && <div className="flex gap-2">
              <form action={settleRefundAction}><input type="hidden" name="refundId" value={refund.id}/><input type="hidden" name="outcome" value="succeeded"/><button type="submit" className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">Marquer réglé</button></form>
              <form action={settleRefundAction}><input type="hidden" name="refundId" value={refund.id}/><input type="hidden" name="outcome" value="failed"/><button type="submit" className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">Échec</button></form>
            </div>}
          </div>;
        })}</div> : <div className="admin-empty"><Undo2 size={24} className="mb-2 text-slate-400"/><strong>Aucun remboursement</strong>Les remboursements se créent depuis une commande payée, ci-dessous.</div>}

        <div className="border-t border-slate-100 p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Nouveau remboursement</h3>
          <form action={refundOrderAction} className="grid gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-700">Commande payée<select name="orderId" required className="ui-input">{billableOrders.filter((order) => (paidByOrder.get(order.id) ?? 0) > 0).map((order) => <option key={order.id} value={order.id}>{order.reference || order.id.slice(0, 8)} — reste {money(Math.max(0, (paidByOrder.get(order.id) ?? 0) - (refundedByOrder.get(order.id) ?? 0)))}</option>)}</select></label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold text-slate-700">Montant (FCFA)<input name="amountXof" type="number" min={1} required className="ui-input"/></label>
              <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700"><input type="checkbox" name="closeOrder" className="size-4 rounded border-slate-300"/> Clôturer si total</label>
            </div>
            <label className="grid gap-1 text-xs font-semibold text-slate-700">Motif<input name="reason" required minLength={5} maxLength={300} className="ui-input" placeholder="Article non conforme, geste commercial…"/></label>
            <button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800">Enregistrer le remboursement et l&apos;avoir</button>
          </form>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Avoirs émis</h2><p className="text-xs text-slate-500">Numérotés dans la même séquence que les factures.</p></div>
        {creditNotes.length ? <div className="divide-y divide-slate-100">{creditNotes.map((note) => <div key={note.id} className="flex items-center justify-between gap-3 p-4">
          <div><div className="text-sm font-semibold text-slate-900">{note.number} · {money(note.amountXof)}</div><div className="text-[11px] text-slate-500">{dateLabel(note.createdAt)} · commande {note.orderId.slice(0, 8)}</div><div className="text-xs text-slate-600">{note.reason}</div></div>
          <Link href={`/commandes/${note.orderId}`} className="text-xs font-semibold text-orange-700 hover:underline">Commande</Link>
        </div>)}</div> : <div className="admin-empty"><strong>Aucun avoir</strong>Un avoir est émis automatiquement à chaque remboursement.</div>}
        <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Une facture annulée conserve son numéro : la séquence légale ne doit jamais présenter de trou. Le remboursement est contrôlé sur les paiements réellement encaissés, jamais sur le montant commandé.</span></div>
      </Card>
    </div>
  </>;
}
