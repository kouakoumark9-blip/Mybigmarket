import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { ClipboardList, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminInvoices, adminOrders, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const statuses = ["awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid", "cancelled", "dispute", "refunded"] as const;

const statusLabels: Record<string, string> = {
  awaiting_payment: "En attente de paiement",
  paid_escrow: "Paiement confirmé",
  seller_confirmed: "Confirmée par le vendeur",
  received_collection_point: "Au point de collecte",
  shipped: "Expédiée",
  arrived_abidjan: "Arrivée à Abidjan",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  seller_paid: "Vendeur payé",
  cancelled: "Annulée",
  dispute: "Litige",
  refunded: "Remboursée",
};

const statusClasses: Record<string, string> = {
  awaiting_payment: "bg-amber-50 text-amber-800",
  paid_escrow: "bg-blue-50 text-blue-800",
  seller_confirmed: "bg-cyan-50 text-cyan-800",
  received_collection_point: "bg-cyan-50 text-cyan-800",
  shipped: "bg-violet-50 text-violet-800",
  arrived_abidjan: "bg-teal-50 text-teal-800",
  out_for_delivery: "bg-teal-50 text-teal-800",
  delivered: "bg-emerald-50 text-emerald-800",
  seller_paid: "bg-emerald-50 text-emerald-900",
  cancelled: "bg-slate-100 text-slate-600",
  dispute: "bg-red-50 text-red-800",
  refunded: "bg-slate-100 text-slate-700",
};

const notices: Record<string, { tone: string; text: string }> = {
  updated: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Statut mis à jour, historique et journal d'audit enregistrés." },
  transition: { tone: "border-red-200 bg-red-50 text-red-800", text: "Transition refusée : ce saut n'est pas autorisé depuis le statut actuel." },
  conflict: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "La commande a changé entre-temps : recharge la page avant de réessayer." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : un motif de 3 caractères minimum est attendu." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Commande introuvable." },
  "seller-paid": { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Vendeur réglé : le séquestre a été libéré." },
  "seller-not-eligible": { tone: "border-red-200 bg-red-50 text-red-800", text: "Le vendeur ne peut être réglé qu'après une livraison effective." },
  note: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Note interne enregistrée." },
};

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date);

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; notice?: string }> }) {
  await requireEmployee("orders.read");
  const params = await searchParams;
  const notice = params.notice ? notices[params.notice] : undefined;
  const status = statuses.find((candidate) => candidate === params.status);
  const query = (params.q || "").trim().slice(0, 80);

  const db = getAdminDb();
  const filters = [
    isNull(adminOrders.deletedAt),
    status ? eq(adminOrders.status, status) : undefined,
    query ? or(ilike(adminOrders.reference, `%${query}%`), ilike(adminUsers.name, `%${query}%`), ilike(adminUsers.email, `%${query}%`)) : undefined,
  ].filter(Boolean);

  const [orders, total, counters, invoiceRows] = await Promise.all([
    db.select({
      id: adminOrders.id,
      reference: adminOrders.reference,
      status: adminOrders.status,
      totalXof: adminOrders.totalXof,
      shippingMode: adminOrders.shippingMode,
      createdAt: adminOrders.createdAt,
      trackingNumber: adminOrders.trackingNumber,
      customerName: adminUsers.name,
      customerEmail: adminUsers.email,
    })
      .from(adminOrders)
      .leftJoin(adminUsers, eq(adminOrders.buyerId, adminUsers.id))
      .where(and(...filters))
      .orderBy(desc(adminOrders.createdAt))
      .limit(100),
    db.select({ value: count() }).from(adminOrders).where(and(...filters)),
    db.select({ status: adminOrders.status, value: count() }).from(adminOrders).where(isNull(adminOrders.deletedAt)).groupBy(adminOrders.status),
    db.select({ orderId: adminInvoices.orderId, number: adminInvoices.invoiceNumber, status: adminInvoices.status }).from(adminInvoices),
  ]);

  const countByStatus = new Map(counters.map((row) => [row.status, Number(row.value)]));
  const invoiceByOrder = new Map(invoiceRows.map((row) => [row.orderId, row]));
  const openOrders = ["awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "dispute"]
    .reduce((sum, key) => sum + (countByStatus.get(key) ?? 0), 0);
  const awaitingPayment = countByStatus.get("awaiting_payment") ?? 0;
  const revenue = orders.filter((order) => !["cancelled", "refunded"].includes(order.status)).reduce((sum, order) => sum + order.totalXof, 0);

  return <>
    <div className="admin-breadcrumb"><span>Ventes</span><span>/</span><strong>Commandes</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Commandes</h1><p className="admin-page-subtitle">Suivi du parcours complet : paiement, confirmation, expédition, livraison, remboursement. Chaque changement est motivé et journalisé.</p></div>
      <div className="flex items-center gap-2">
        <Link href="/commandes/retours" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Retours</Link>
        <Link href="/factures" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">Factures</Link>
      </div>
    </div>

    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <div className="mb-5 grid gap-4 sm:grid-cols-4">
      <Card className="flex items-center gap-3 p-4"><ClipboardList size={19} className="text-slate-600"/><div><div className="text-xs text-slate-500">Commandes en cours</div><strong className="text-lg">{openOrders}</strong></div></Card>
      <Card className="flex items-center gap-3 p-4"><TriangleAlert size={19} className="text-amber-600"/><div><div className="text-xs text-slate-500">En attente de paiement</div><strong className="text-lg">{awaitingPayment}</strong></div></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Chiffre affiché (page)</div><strong className="text-lg">{money(revenue)}</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Commandes listées</div><strong className="text-lg">{Number(total[0]?.value || 0)}</strong></Card>
    </div>

    <Card className="mb-5 p-4 sm:p-5">
      <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700 lg:col-span-2">Recherche<span className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={query} maxLength={80} placeholder="Référence, nom ou e-mail du client" className="ui-input pl-9"/></span></label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Statut<select name="status" defaultValue={status || ""} className="ui-input"><option value="">Tous les statuts</option>{statuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>
        <div className="flex items-end gap-2"><button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Search size={15}/>Filtrer</button>{(query || status) && <Link href="/commandes" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Effacer</Link>}</div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      {orders.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1050px]">
        <thead><tr><th>Commande</th><th>Client</th><th>Montant</th><th>Livraison</th><th>Facture</th><th>Statut</th><th></th></tr></thead>
        <tbody>{orders.map((order) => {
          const invoice = invoiceByOrder.get(order.id);
          return <tr key={order.id}>
            <td><div className="font-semibold text-slate-900">{order.reference || order.id.slice(0, 8)}</div><div className="text-[11px] text-slate-500">{dateLabel(order.createdAt)}{order.trackingNumber ? ` · suivi ${order.trackingNumber}` : ""}</div></td>
            <td><div className="text-sm text-slate-900">{order.customerName || "Client supprimé"}</div><div className="text-[11px] text-slate-500">{order.customerEmail}</div></td>
            <td className="whitespace-nowrap font-semibold">{money(order.totalXof)}</td>
            <td className="text-xs">{order.shippingMode === "air" ? "Avion" : order.shippingMode === "sea" ? "Bateau" : "—"}</td>
            <td className="text-xs">{invoice ? <span className={`rounded-full px-2 py-0.5 font-semibold ${invoice.status === "void" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-800"}`}>{invoice.number}</span> : <span className="text-slate-400">aucune</span>}</td>
            <td><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses[order.status] || "bg-slate-100 text-slate-700"}`}>{statusLabels[order.status] || order.status}</span></td>
            <td className="text-right"><Link href={`/commandes/${order.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Ouvrir</Link></td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="admin-empty"><ClipboardList size={24} className="mb-2 text-slate-400"/><strong>Aucune commande</strong>{query || status ? "Aucun résultat pour ce filtre." : "Les commandes apparaîtront ici dès le premier achat."}</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Le « chiffre affiché » additionne les commandes de la page, hors annulées et remboursées. Il ne remplace pas un état financier : les remboursements partiels ne sont pas déduits ici.</span></div>
    </Card>
    {orders.length === 100 && <p className="mt-3 text-xs text-slate-500">Affichage limité aux 100 commandes les plus récentes ; affine la recherche pour retrouver une commande ancienne.</p>}
  </>;
}
