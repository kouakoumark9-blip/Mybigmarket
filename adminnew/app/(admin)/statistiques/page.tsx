import { and, count, desc, eq, gte, inArray, sum } from "drizzle-orm";
import { Activity, BadgeDollarSign, ClipboardList, PackageCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminOrders, adminProducts, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const statusLabels: Record<string, string> = { awaiting_payment: "En attente de paiement", paid_escrow: "Paiement confirmé (simulation)", seller_confirmed: "Confirmée par le vendeur", received_collection_point: "Au point de collecte", shipped: "Expédiée", arrived_abidjan: "Arrivée à Abidjan", out_for_delivery: "En livraison", delivered: "Livrée", cancelled: "Annulée", dispute: "Litige", refunded: "Remboursement simulé" };

export default async function AnalyticsPage() {
  await requireEmployee("analytics.read");
  const db = getAdminDb();
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [revenueResult, orderTotal, monthOrders, newBuyers, publishedProducts, statusRows] = await Promise.all([
    db.select({ value: sum(adminOrders.totalXof) }).from(adminOrders).where(inArray(adminOrders.status, ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered"])) ,
    db.select({ value: count() }).from(adminOrders),
    db.select({ value: count() }).from(adminOrders).where(gte(adminOrders.createdAt, monthStart)),
    db.select({ value: count() }).from(adminUsers).where(and(eq(adminUsers.role, "buyer"), gte(adminUsers.createdAt, monthStart))),
    db.select({ value: count() }).from(adminProducts).where(eq(adminProducts.status, "published")),
    db.select({ status: adminOrders.status, value: count() }).from(adminOrders).groupBy(adminOrders.status).orderBy(desc(count())).limit(8),
  ]);
  const metrics = [
    { label: "Commandes enregistrées", value: Number(orderTotal[0]?.value || 0).toLocaleString("fr-FR"), icon: ClipboardList },
    { label: "Commandes créées ce mois", value: Number(monthOrders[0]?.value || 0).toLocaleString("fr-FR"), icon: Activity },
    { label: "Nouveaux acheteurs ce mois", value: Number(newBuyers[0]?.value || 0).toLocaleString("fr-FR"), icon: Users },
    { label: "Produits publiés", value: Number(publishedProducts[0]?.value || 0).toLocaleString("fr-FR"), icon: PackageCheck },
  ];

  return <>
    <div className="admin-breadcrumb"><span>Boutique</span><span>/</span><strong>Statistiques</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Statistiques</h1><p className="admin-page-subtitle">Indicateurs calculés à partir des données actuellement enregistrées.</p></div></div>
    <div className="admin-metric-grid">{metrics.map((metric) => { const Icon = metric.icon; return <Card key={metric.label} className="admin-metric"><div className="flex items-center justify-between"><span className="admin-metric-label">{metric.label}</span><Icon size={18} className="text-cyan-700"/></div><div className="admin-metric-value">{metric.value}</div><div className="admin-metric-note">Base de données Neon</div></Card>; })}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><Card><div className="flex items-center gap-2 border-b border-slate-100 p-5"><BadgeDollarSign size={18} className="text-cyan-700"/><h2 className="font-bold text-slate-950">Montants des commandes non annulées</h2></div><div className="p-5"><p className="text-3xl font-bold text-slate-950">{money(Number(revenueResult[0]?.value || 0))}</p><p className="mt-2 text-xs leading-5 text-slate-500">Somme applicative des commandes en cours ou livrées. Ce chiffre n’est ni un encaissement bancaire ni un solde de séquestre.</p></div></Card><Card><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Commandes par statut</h2></div>{statusRows.length ? <div className="divide-y divide-slate-100">{statusRows.map((row) => <div key={row.status} className="flex items-center justify-between gap-4 px-5 py-3 text-sm"><span className="text-slate-700">{statusLabels[row.status] || row.status}</span><strong className="text-slate-950">{Number(row.value).toLocaleString("fr-FR")}</strong></div>)}</div> : <div className="admin-empty"><strong>Aucune commande</strong>Les répartitions apparaîtront ici après les premières commandes.</div>}</Card></div>
    <p className="mt-4 text-xs text-slate-500">Les métriques reflètent uniquement les données stockées. Les avis, vendeurs et paiements ne sont pas vérifiés par cet écran.</p>
  </>;
}
