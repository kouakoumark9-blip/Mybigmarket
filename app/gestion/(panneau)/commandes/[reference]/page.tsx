import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { updateOrderAction } from "@/app/gestion/actions";
import { getDb } from "@/lib/db";
import { shopOrderItems, shopOrders } from "@/lib/db/schema";
import { whatsappLink } from "@/lib/shop/config";
import { formatFcfa } from "@/lib/shop/format";
import { SHOP_ORDER_STATUSES } from "@/lib/shop/orders";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ maj?: string }> }) {
  const { reference } = await params;
  if (!/^MBM-\d{6}-[A-Z0-9]{4}$/.test(reference)) notFound();
  const db = getDb();
  const [order] = await db.select().from(shopOrders).where(eq(shopOrders.reference, reference)).limit(1);
  if (!order) notFound();
  const [items, query] = await Promise.all([db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id)), searchParams]);
  const customerLink = `https://wa.me/225${order.phone.replace(/^0/, "0")}?text=${encodeURIComponent(`Bonjour ${order.customerName}, c'est MyBigMarket au sujet de votre commande ${order.reference}.`)}`;
  return <>
    <h1>Commande {order.reference}</h1>
    {query.maj && <div className="gs-msg gs-msg--ok">Commande mise à jour.</div>}
    <p><Link href="/gestion/commandes">← Retour aux commandes</Link></p>
    <div className="gs-grid" style={{ alignItems: "start" }}>
      <div className="gs-card"><h2>Client</h2>
        <p><b>{order.customerName}</b><br/>{order.phone}<br/>{order.commune}<br/>{order.address}</p>
        {order.customerNote && <p>Message : {order.customerNote}</p>}
        <p><a className="gs-btn gs-btn--ghost" href={customerLink} rel="noopener">Écrire au client sur WhatsApp</a></p>
      </div>
      <form action={updateOrderAction} className="gs-card gs-form"><h2>Suivi</h2>
        <input type="hidden" name="id" value={order.id}/><input type="hidden" name="reference" value={order.reference}/>
        <div className="gs-field"><label htmlFor="status">Statut</label><select id="status" name="status" defaultValue={order.status}>{SHOP_ORDER_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="gs-field"><label htmlFor="internalNote">Note interne (jamais visible du client)</label><textarea id="internalNote" name="internalNote" defaultValue={order.internalNote}/></div>
        <button className="gs-btn" type="submit">Enregistrer</button>
      </form>
    </div>
    <div className="gs-card"><h2>Produits</h2><div className="gs-scroll"><table className="gs-table"><thead><tr><th>Produit</th><th>Délai annoncé</th><th>Prix</th><th>Qté</th><th>Total</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td>{item.title}</td><td>{item.availabilityLabel}</td><td>{formatFcfa(item.unitPriceXof)}</td><td>{item.quantity}</td><td>{formatFcfa(item.unitPriceXof * item.quantity)}</td></tr>)}
      <tr><td colSpan={4}>Livraison ({order.commune})</td><td>{formatFcfa(order.deliveryFeeXof)}</td></tr>
      <tr><td colSpan={4}><b>Total à encaisser à la livraison</b></td><td><b>{formatFcfa(order.totalXof)}</b></td></tr>
    </tbody></table></div><p style={{ color: "#5b6577", fontSize: 13 }}>Paiement : à la livraison. Boutique : <a href={whatsappLink()} rel="noopener">WhatsApp</a>.</p></div>
  </>;
}
