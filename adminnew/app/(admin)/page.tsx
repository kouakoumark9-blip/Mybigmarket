import { and, count, desc, eq, gte, inArray, sum } from "drizzle-orm";
import { ArrowUpRight, BadgeDollarSign, ClipboardList, PackageCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEmployee } from "@/lib/permissions";
import { getAdminDb } from "@/lib/db";
import { adminOrders, adminProducts, adminUsers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const money = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date);
const statusLabels: Record<string, string> = { awaiting_payment: "En attente de paiement", paid_escrow: "Payée", seller_confirmed: "Confirmée", shipped: "Expédiée", arrived_abidjan: "Arrivée à Abidjan", delivered: "Livrée", cancelled: "Annulée", dispute: "Litige" };

export default async function DashboardPage() {
  await requireEmployee("dashboard.read");
  const db = getAdminDb();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenueStatuses = ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"];
  const [revenueResult] = await db.select({ value: sum(adminOrders.totalXof) }).from(adminOrders).where(inArray(adminOrders.status, revenueStatuses));
  const [orderCount] = await db.select({ value: count() }).from(adminOrders);
  const [newCustomers] = await db.select({ value: count() }).from(adminUsers).where(and(eq(adminUsers.role, "buyer"), gte(adminUsers.createdAt, monthStart)));
  const [productCount] = await db.select({ value: count() }).from(adminProducts).where(eq(adminProducts.status, "published"));
  const [lowStock] = await db.select({ value: count() }).from(adminProducts).where(and(eq(adminProducts.status, "published"), eq(adminProducts.quantity, 0)));
  const recentOrders = await db.select({ id: adminOrders.id, status: adminOrders.status, totalXof: adminOrders.totalXof, createdAt: adminOrders.createdAt, customerName: adminUsers.name })
    .from(adminOrders).leftJoin(adminUsers, eq(adminOrders.buyerId, adminUsers.id)).orderBy(desc(adminOrders.createdAt)).limit(6);
  const revenue = Number(revenueResult?.value || 0);

  return <>
    <div className="admin-breadcrumb"><span>Administration</span><span>/</span><strong>Tableau de bord</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Tableau de bord</h1><p className="admin-page-subtitle">Vue d’ensemble des données enregistrées dans la boutique.</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">Données de la boutique</span></div>
    <div className="admin-metric-grid">
      <Card className="admin-metric"><div className="flex items-center justify-between"><span className="admin-metric-label">Chiffre d’affaires confirmé</span><BadgeDollarSign size={18} className="text-cyan-700"/></div><div className="admin-metric-value">{money(revenue)}</div><div className="admin-metric-note">Commandes payées ou en cours d’exécution</div></Card>
      <Card className="admin-metric"><div className="flex items-center justify-between"><span className="admin-metric-label">Commandes</span><ClipboardList size={18} className="text-cyan-700"/></div><div className="admin-metric-value">{Number(orderCount?.value || 0).toLocaleString("fr-FR")}</div><div className="admin-metric-note">Toutes périodes confondues</div></Card>
      <Card className="admin-metric"><div className="flex items-center justify-between"><span className="admin-metric-label">Nouveaux clients</span><Users size={18} className="text-cyan-700"/></div><div className="admin-metric-value">{Number(newCustomers?.value || 0).toLocaleString("fr-FR")}</div><div className="admin-metric-note">Depuis le début du mois</div></Card>
      <Card className="admin-metric"><div className="flex items-center justify-between"><span className="admin-metric-label">Produits publiés</span><PackageCheck size={18} className="text-cyan-700"/></div><div className="admin-metric-value">{Number(productCount?.value || 0).toLocaleString("fr-FR")}</div><div className="admin-metric-note">{Number(lowStock?.value || 0)} sans stock</div></Card>
    </div>
    <div className="admin-dashboard-grid">
      <Card>
        <CardHeader><CardTitle>Commandes récentes</CardTitle><span className="text-[11px] text-slate-500">{Number(orderCount?.value || 0)} au total</span></CardHeader>
        {recentOrders.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Référence</th><th>Client</th><th>Date</th><th>Statut</th><th>Total</th></tr></thead><tbody>{recentOrders.map((order) => <tr key={order.id}><td className="font-semibold text-slate-700">{order.id.slice(0, 8).toUpperCase()}</td><td>{order.customerName || "Client"}</td><td>{dateLabel(order.createdAt)}</td><td><span className="admin-status">{statusLabels[order.status] || order.status}</span></td><td className="font-semibold">{money(order.totalXof)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><strong>Aucune commande enregistrée</strong>Les commandes apparaîtront ici après leur création dans la boutique.</div>}
      </Card>
      <div className="grid content-start gap-4">
        <Card><CardHeader><CardTitle>Ventes</CardTitle><ArrowUpRight size={16} className="text-slate-400"/></CardHeader><CardContent className="admin-empty"><strong>{money(revenue)}</strong>Chiffre d’affaires cumulé à partir des commandes confirmées.</CardContent></Card>
        <Card><CardHeader><CardTitle>Stock à surveiller</CardTitle></CardHeader><CardContent className="admin-empty"><strong>{Number(lowStock?.value || 0)} produit(s) sans stock</strong>Basé sur les produits publiés actuellement enregistrés.</CardContent></Card>
      </div>
    </div>
  </>;
}
