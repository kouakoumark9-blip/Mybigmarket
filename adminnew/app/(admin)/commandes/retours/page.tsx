import { desc, eq } from "drizzle-orm";
import { PackageOpen, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminOrders, adminReturnRequestItems, adminReturnRequests, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { RETURN_REASON_LABELS } from "@/lib/order-rules";
import { approveReturnAction, receiveReturnAction, refuseReturnAction } from "../actions";

export const dynamic = "force-dynamic";

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const dateLabel = (date: Date | null) => (date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "—");

const statusLabels: Record<string, string> = {
  requested: "Demandé",
  approved: "Approuvé",
  received: "Reçu",
  closed: "Clôturé",
  refused: "Refusé",
};

const notices: Record<string, string> = {
  "return-approved": "Retour approuvé : le client peut renvoyer les articles.",
  "return-received": "Retour réceptionné : les articles revendables sont remis en stock.",
  "return-refused": "Retour refusé, motif conservé en interne.",
  "return-bad-status": "Action impossible depuis le statut actuel du retour.",
  missing: "Retour introuvable.",
  invalid: "Formulaire invalide : un motif de 5 caractères minimum est attendu pour un refus.",
};

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("support.disputes.manage");
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const db = getAdminDb();

  const [requests, items] = await Promise.all([
    db.select({
      id: adminReturnRequests.id,
      reference: adminReturnRequests.reference,
      status: adminReturnRequests.status,
      reason: adminReturnRequests.reason,
      customerMessage: adminReturnRequests.customerMessage,
      internalNote: adminReturnRequests.internalNote,
      expectedAmountXof: adminReturnRequests.expectedAmountXof,
      createdAt: adminReturnRequests.createdAt,
      approvedAt: adminReturnRequests.approvedAt,
      receivedAt: adminReturnRequests.receivedAt,
      orderId: adminReturnRequests.orderId,
      orderReference: adminOrders.reference,
      customerName: adminUsers.name,
    })
      .from(adminReturnRequests)
      .leftJoin(adminOrders, eq(adminReturnRequests.orderId, adminOrders.id))
      .leftJoin(adminUsers, eq(adminReturnRequests.customerId, adminUsers.id))
      .orderBy(desc(adminReturnRequests.createdAt))
      .limit(100),
    db.select({
      returnRequestId: adminReturnRequestItems.returnRequestId,
      quantity: adminReturnRequestItems.quantity,
      unitPriceXof: adminReturnRequestItems.unitPriceXof,
      restock: adminReturnRequestItems.restock,
      condition: adminReturnRequestItems.condition,
    }).from(adminReturnRequestItems),
  ]);

  const itemsByRequest = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByRequest.get(item.returnRequestId) ?? [];
    list.push(item);
    itemsByRequest.set(item.returnRequestId, list);
  }

  const pending = requests.filter((request) => request.status === "requested").length;
  const toReceive = requests.filter((request) => request.status === "approved").length;

  return <>
    <div className="admin-breadcrumb"><span>Ventes</span><span>/</span><Link href="/commandes" className="hover:underline">Commandes</Link><span>/</span><strong>Retours</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Retours et remboursements</h1><p className="admin-page-subtitle">Délai de 14 jours pour un changement d&apos;avis, 30 jours pour un article défectueux ou non conforme — après livraison uniquement.</p></div>
      <Link href="/commandes" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Retour aux commandes</Link>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.includes("impossible") || notice.includes("invalide") || notice.includes("introuvable") ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role="status">{notice}</p>}

    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Card className="flex items-center gap-3 p-4"><PackageOpen size={19} className="text-slate-600"/><div><div className="text-xs text-slate-500">Demandes à traiter</div><strong className="text-lg">{pending}</strong></div></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Colis attendus</div><strong className="text-lg">{toReceive}</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Montant attendu (total)</div><strong className="text-lg">{money(requests.filter((request) => request.status !== "refused").reduce((sum, request) => sum + request.expectedAmountXof, 0))}</strong></Card>
    </div>

    {requests.length ? <div className="grid gap-4">
      {requests.map((request) => {
        const lines = itemsByRequest.get(request.id) ?? [];
        return <Card key={request.id} className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <div className="flex items-center gap-2"><h2 className="font-bold text-slate-950">{request.reference}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${request.status === "requested" ? "bg-amber-50 text-amber-800" : request.status === "approved" ? "bg-blue-50 text-blue-800" : request.status === "received" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{statusLabels[request.status] || request.status}</span></div>
              <p className="mt-1 text-xs text-slate-500">Commande <Link href={`/commandes/${request.orderId}`} className="font-semibold text-orange-700 hover:underline">{request.orderReference || request.orderId.slice(0, 8)}</Link> · {request.customerName || "client supprimé"} · demandé le {dateLabel(request.createdAt)}</p>
              <p className="mt-1 text-xs text-slate-700">Motif : <strong>{RETURN_REASON_LABELS[request.reason as keyof typeof RETURN_REASON_LABELS] || request.reason}</strong> · attendu {money(request.expectedAmountXof)}</p>
            </div>
            <div className="text-[11px] text-slate-500">{(request.approvedAt ? "approuvé " + dateLabel(request.approvedAt) : "")}{(request.receivedAt ? " · reçu " + dateLabel(request.receivedAt) : "")}</div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="grid gap-2">
              {lines.map((line, index) => <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <span>{line.quantity} × {money(line.unitPriceXof)}</span>
                <span className="flex items-center gap-2 text-slate-600"><span className="rounded bg-white px-1.5 py-0.5 font-semibold">{line.condition}</span>{line.restock ? <span className="text-emerald-700">remise en stock</span> : <span className="text-amber-700">non revendable</span>}</span>
              </div>)}
              {request.customerMessage && <p className="rounded-lg bg-white p-3 text-xs text-slate-700 ring-1 ring-slate-100">« {request.customerMessage} »</p>}
              {request.internalNote && <p className="text-[11px] text-slate-500">Note interne : {request.internalNote}</p>}
            </div>

            <div className="grid content-start gap-2">
              {request.status === "requested" && <>
                <form action={approveReturnAction} className="grid gap-2"><input type="hidden" name="returnId" value={request.id}/><input name="internalNote" maxLength={1000} className="ui-input" placeholder="Note interne (facultatif)"/><button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-950 text-xs font-semibold text-white hover:bg-slate-800">Approuver le retour</button></form>
                <form action={refuseReturnAction} className="grid gap-2"><input type="hidden" name="returnId" value={request.id}/><input name="internalNote" required minLength={5} maxLength={1000} className="ui-input" placeholder="Motif du refus (obligatoire)"/><button type="submit" className="inline-flex h-9 items-center justify-center rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50">Refuser</button></form>
              </>}
              {request.status === "approved" && <form action={receiveReturnAction}><input type="hidden" name="returnId" value={request.id}/><button type="submit" className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-slate-950 text-xs font-semibold text-white hover:bg-slate-800">Réceptionner le colis</button></form>}
              {request.status === "received" && <Link href="/factures" className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Rembourser depuis Factures</Link>}
              {["closed", "refused"].includes(request.status) && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Dossier clos : aucune action attendue.</p>}
            </div>
          </div>
        </Card>;
      })}
    </div> : <Card><div className="admin-empty"><PackageOpen size={24} className="mb-2 text-slate-400"/><strong>Aucune demande de retour</strong>Les demandes clients apparaîtront ici pour traitement.</div></Card>}

    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Un article endommagé ou d&apos;occasion n&apos;est jamais remis en vente : la remise en stock n&apos;est proposée que pour un article en état neuf. La réception d&apos;un retour n&apos;entraîne pas le remboursement : celui-ci reste une décision distincte, plafonnée à l&apos;encaissé.</span></p>
  </>;
}
