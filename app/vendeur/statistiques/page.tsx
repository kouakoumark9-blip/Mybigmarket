import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { ArrowLeft, BarChart3, Boxes, CircleDollarSign, PackageCheck } from "lucide-react";
import { requireRole } from "@/lib/access";
import { getDb } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { formatXof } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Statistiques vendeur" };
const countedStatuses = ["paid_escrow", "seller_confirmed", "received_collection_point", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"] as const;
const statusLabel: Record<string, string> = { paid_escrow: "Paiement mock confirmé", seller_confirmed: "Confirmée", received_collection_point: "Collecte Chine", shipped: "Expédiée", arrived_abidjan: "Arrivée à Abidjan", out_for_delivery: "En livraison", delivered: "Livrée", seller_paid: "Clôturée" };
export default async function SellerAnalyticsPage() {
  const seller = await requireRole("seller");
  const db = getDb();
  const since = new Date(); since.setMonth(since.getMonth() - 5, 1); since.setHours(0, 0, 0, 0);
  const rows = await db.select({ orderId: orders.id, createdAt: orders.createdAt, status: orders.status, productTitle: orderItems.productTitle, quantity: orderItems.quantity, unitPriceXof: orderItems.unitPriceXof })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.sellerId, seller.id), inArray(orders.status, [...countedStatuses]), gte(orders.createdAt, since)))
    .orderBy(desc(orders.createdAt)).limit(5000);
  const monthRows = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); date.setHours(0, 0, 0, 0);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date), revenue: 0, units: 0, orderIds: new Set<string>() };
  });
  const monthMap = new Map(monthRows.map((month) => [month.key, month]));
  const productMap = new Map<string, { units: number; revenue: number }>();
  const recentMap = new Map<string, { id: string; date: Date; status: string; units: number; total: number }>();
  let grossXof = 0; let unitsSold = 0;
  for (const row of rows) {
    const lineValue = row.quantity * row.unitPriceXof;
    const monthKey = `${row.createdAt.getFullYear()}-${row.createdAt.getMonth()}`;
    const month = monthMap.get(monthKey);
    if (month) { month.revenue += lineValue; month.units += row.quantity; month.orderIds.add(row.orderId); }
    grossXof += lineValue; unitsSold += row.quantity;
    const product = productMap.get(row.productTitle) || { units: 0, revenue: 0 };
    product.units += row.quantity; product.revenue += lineValue; productMap.set(row.productTitle, product);
    const order = recentMap.get(row.orderId) || { id: row.orderId, date: row.createdAt, status: row.status, units: 0, total: 0 };
    order.units += row.quantity; order.total += lineValue; recentMap.set(row.orderId, order);
  }
  const orderCount = recentMap.size;
  const maxRevenue = Math.max(1, ...monthRows.map((month) => month.revenue));
  const topProducts = [...productMap.entries()].map(([title, value]) => ({ title, ...value })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const recentOrders = [...recentMap.values()].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8);
  return <main className="shell page-space seller-analytics-page">
    <div className="breadcrumbs"><Link href="/vendeur">Espace vendeur</Link><span>›</span><span>Statistiques</span></div><Link className="back-link" href="/vendeur"><ArrowLeft size={15}/> Retour à l’espace vendeur</Link>
    <span className="eyebrow">APERÇU DES 6 DERNIERS MOIS</span><h1 className="page-title">Statistiques de vente</h1><p className="page-subtitle">Indicateurs calculés à partir des commandes par vendeur et des lignes de produits.</p>
    <div className="admin-stats seller-analytics-stats"><div className="stat-card"><small>Volume associé aux commandes payées (mock)</small><b><CircleDollarSign size={18}/>{formatXof(grossXof)}</b></div><div className="stat-card"><small>Commandes</small><b><PackageCheck size={18}/>{orderCount}</b></div><div className="stat-card"><small>Unités vendues</small><b><Boxes size={18}/>{unitsSold.toLocaleString("fr-FR")}</b></div><div className="stat-card"><small>Panier moyen indicatif</small><b>{formatXof(orderCount ? Math.round(grossXof / orderCount) : 0)}</b></div></div>
    <div className="seller-analytics-grid"><section className="account-panel seller-analytics-card"><div className="seller-analytics-heading"><span className="eyebrow">TENDANCE</span><h2><BarChart3 size={17}/> Volume par mois</h2></div><div className="seller-month-chart" role="img" aria-label="Volume des commandes par mois">{monthRows.map((month) => <div className="seller-month-column" key={month.key}><b>{month.revenue ? formatXof(month.revenue) : "—"}</b><div className="seller-month-track"><i style={{ height: `${month.revenue ? Math.max(5, Math.round(month.revenue / maxRevenue * 100)) : 2}%` }}/></div><span>{month.label}</span><small>{month.orderIds.size} commande{month.orderIds.size === 1 ? "" : "s"}</small></div>)}</div></section>
      <section className="account-panel seller-analytics-card"><div className="seller-analytics-heading"><span className="eyebrow">MEILLEURES OFFRES</span><h2>Produits les plus vendus</h2></div>{topProducts.length ? <div className="seller-top-products">{topProducts.map((product, index) => <div key={product.title}><span>{index + 1}</span><b>{product.title}</b><small>{product.units} unités · {formatXof(product.revenue)}</small></div>)}</div> : <div className="seller-analytics-empty">Les produits apparaîtront après les premières commandes avec statut payé.</div>}</section></div>
    <section className="admin-section"><div className="section-heading"><div><span className="eyebrow">ACTIVITÉ</span><h2>Commandes récentes ({recentOrders.length})</h2></div></div>{recentOrders.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Référence</th><th>Date</th><th>Articles</th><th>Valeur indicative</th><th>Statut</th></tr></thead><tbody>{recentOrders.map((order) => <tr key={order.id}><td>#{order.id.slice(0, 8).toUpperCase()}</td><td>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(order.date)}</td><td>{order.units}</td><td>{formatXof(order.total)}</td><td>{statusLabel[order.status] || order.status}</td></tr>)}</tbody></table></div> : <div className="account-panel empty-admin">Aucune commande marquée payée sur la période.</div>}</section>
    <div className="admin-safety-note seller-analytics-note">Ces indicateurs décrivent l’activité enregistrée dans mybigmarket. Les paiements affichés sont simulés; aucun fonds réel n’est reçu ni versé.</div>
  </main>;
}
