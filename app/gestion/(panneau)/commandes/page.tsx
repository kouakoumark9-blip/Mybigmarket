import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shopOrders } from "@/lib/db/schema";
import { formatFcfa } from "@/lib/shop/format";
import { SHOP_ORDER_STATUSES, statusLabel } from "@/lib/shop/orders";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { statut = "" } = await searchParams;
  const valid = SHOP_ORDER_STATUSES.some((item) => item.value === statut);
  const rows = await getDb().select().from(shopOrders).where(valid ? eq(shopOrders.status, statut) : undefined).orderBy(desc(shopOrders.createdAt)).limit(200);
  return <>
    <h1>Commandes</h1>
    <div className="gs-filter"><Link href="/gestion/commandes" aria-current={!valid}>Toutes</Link>{SHOP_ORDER_STATUSES.map((item) => <Link key={item.value} href={`/gestion/commandes?statut=${item.value}`} aria-current={statut === item.value}>{item.label}</Link>)}</div>
    <div className="gs-scroll"><table className="gs-table"><thead><tr><th>Numéro</th><th>Date</th><th>Client</th><th>Téléphone</th><th>Commune</th><th>Total</th><th>Statut</th></tr></thead><tbody>
      {rows.map((order) => <tr key={order.id}><td><Link href={`/gestion/commandes/${order.reference}`}>{order.reference}</Link></td><td>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" }).format(order.createdAt)}</td><td>{order.customerName}</td><td>{order.phone}</td><td>{order.commune}</td><td>{formatFcfa(order.totalXof)}</td><td><span className={`gs-pill${order.status === "new" ? " gs-pill--new" : order.status === "delivered" ? " gs-pill--ok" : order.status === "cancelled" ? " gs-pill--no" : ""}`}>{statusLabel(order.status)}</span></td></tr>)}
      {!rows.length && <tr><td colSpan={7}>Aucune commande.</td></tr>}
    </tbody></table></div>
  </>;
}
