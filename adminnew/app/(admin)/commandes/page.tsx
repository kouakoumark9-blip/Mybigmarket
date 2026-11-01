import { count, desc, eq } from "drizzle-orm";
import { ClipboardList, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminOrders, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { changeOrderStatusAction } from "./actions";

export const dynamic = "force-dynamic";
const statuses = ["awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "cancelled", "dispute", "refunded"] as const;
const statusLabels: Record<string, string> = { awaiting_payment: "En attente de paiement", paid_escrow: "Paiement confirmé (simulation)", seller_confirmed: "Confirmée par le vendeur", received_collection_point: "Au point de collecte", shipped: "Expédiée", arrived_abidjan: "Arrivée à Abidjan", out_for_delivery: "En livraison", delivered: "Livrée", cancelled: "Annulée", dispute: "Litige", refunded: "Remboursement simulé" };
const nextStatuses: Record<string, string[]> = { paid_escrow: ["seller_confirmed"], seller_confirmed: ["received_collection_point"], received_collection_point: ["shipped"], shipped: ["arrived_abidjan"], arrived_abidjan: ["out_for_delivery", "delivered"], out_for_delivery: ["delivered"] };
const notices: Record<string, string> = { updated: "Statut de commande mis à jour et journalisé.", transition: "Cette transition n’est pas permise pour le statut actuel.", invalid: "Saisis un motif de 5 caractères minimum.", error: "La mise à jour n’a pas abouti. Réessaie." };
const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  await requireEmployee("orders.read");
  const params = await searchParams;
  const status = statuses.find((candidate) => candidate === params.status);
  const filter = status ? eq(adminOrders.status, status) : undefined;
  const db = getAdminDb();
  const [orders, total] = await Promise.all([
    db.select({ id: adminOrders.id, status: adminOrders.status, totalXof: adminOrders.totalXof, createdAt: adminOrders.createdAt, customerName: adminUsers.name })
      .from(adminOrders).leftJoin(adminUsers, eq(adminOrders.buyerId, adminUsers.id)).where(filter).orderBy(desc(adminOrders.createdAt)).limit(100),
    db.select({ value: count() }).from(adminOrders).where(filter),
  ]);
  const notice = params.notice ? notices[params.notice] : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Ventes</span><span>/</span><strong>Commandes</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Commandes</h1><p className="admin-page-subtitle">Suivi des commandes et transitions logistiques permises.</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{Number(total[0]?.value || 0)} commande(s)</span></div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${params.notice === "updated" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`} role="status">{notice}</p>}
    <form action="/api/commandes/export" method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid gap-1"><label htmlFor="export-from" className="text-[11px] font-semibold text-slate-500">Du</label><input id="export-from" type="date" name="from" className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-700"/></div>
      <div className="grid gap-1"><label htmlFor="export-to" className="text-[11px] font-semibold text-slate-500">Au</label><input id="export-to" type="date" name="to" className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-700"/></div>
      <div className="grid gap-1"><label htmlFor="export-status" className="text-[11px] font-semibold text-slate-500">Statut</label><select id="export-status" name="status" defaultValue="" className="h-9 rounded-lg border border-slate-200 px-2 text-xs text-slate-700"><option value="">Tous</option>{statuses.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></div>
      <button type="submit" className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white">Exporter en CSV</button>
      <span className="text-[11px] leading-4 text-slate-500">Export filtré, journalisé et limité à 5 000 lignes. Les cellules sont neutralisées contre l’injection de formule.</span>
    </form>
    <div className="mb-5 flex flex-wrap gap-2"><a href="/commandes" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!status ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>Toutes</a>{statuses.map((value) => <a key={value} href={`/commandes?status=${value}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{statusLabels[value]}</a>)}</div>
    <Card>
      {orders.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1000px]"><thead><tr><th>Référence</th><th>Client</th><th>Date</th><th>Total</th><th>Statut</th><th>Transition</th></tr></thead><tbody>{orders.map((order) => { const allowed = nextStatuses[order.status] || []; return <tr key={order.id}><td className="font-semibold text-slate-800">{order.id.slice(0, 8).toUpperCase()}</td><td>{order.customerName || "Client"}</td><td className="whitespace-nowrap">{dateLabel(order.createdAt)}</td><td className="whitespace-nowrap font-semibold">{money(order.totalXof)}</td><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{statusLabels[order.status] || order.status}</span></td><td>{allowed.length ? <form action={changeOrderStatusAction} className="flex min-w-[460px] items-center gap-2"><input type="hidden" name="orderId" value={order.id}/><select name="status" defaultValue={allowed[0]} className="ui-input !h-9 min-w-44">{allowed.map((next) => <option value={next} key={next}>{statusLabels[next]}</option>)}</select><input name="note" required minLength={5} maxLength={300} placeholder="Motif obligatoire" className="ui-input !h-9 min-w-40 flex-1"/><button type="submit" className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white">Mettre à jour</button></form> : <span className="text-xs text-slate-400">Aucune transition permise</span>}</td></tr>; })}</tbody></table></div> : <div className="admin-empty"><ClipboardList size={23} className="mb-2 text-slate-400"/><strong>Aucune commande</strong>Les commandes réelles apparaîtront ici après leur création dans la boutique.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-700"/><span>Chaque transition requiert un motif et un rôle autorisé. Paiements, remboursements et séquestre restent simulés; aucun fonds ne bouge depuis ce tableau.</span></div>
    </Card>
  </>;
}
