import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/access";
import { getDb } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { formatXof } from "@/lib/demo-data";

export const metadata:Metadata={title:"Commandes vendeur"};
const status:Record<string,string>={awaiting_payment:"En attente de paiement",paid_escrow:"Payée · fonds bloqués",seller_confirmed:"Confirmée",received_collection_point:"Reçue au point de collecte",shipped:"Expédiée",arrived_abidjan:"Arrivée à Abidjan",out_for_delivery:"En livraison",delivered:"Livrée",seller_paid:"Vendeur payé",cancelled:"Annulée",dispute:"Litige",refunded:"Remboursée"};
export default async function SellerOrdersPage(){const user=await requireRole("seller");const db=getDb();const rows=await db.select({item:orderItems,order:orders}).from(orderItems).innerJoin(orders,eq(orders.id,orderItems.orderId)).where(eq(orderItems.sellerId,user.id)).orderBy(desc(orders.createdAt));return <main className="shell page-space"><div className="breadcrumbs"><Link href="/vendeur">Espace vendeur</Link><span>›</span><span>Commandes</span></div><h1 className="page-title">Mes commandes</h1><p className="page-subtitle">Seules les lignes de commande de vos produits sont affichées.</p>{!rows.length?<div className="cart-panel cart-empty"><h2>Aucune commande vendeur</h2><p>Les nouvelles commandes associées à vos produits apparaîtront ici.</p></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Commande</th><th>Produit</th><th>Qté</th><th>Montant ligne</th><th>Statut</th><th>Date</th></tr></thead><tbody>{rows.map(({item,order})=><tr key={item.id}><td>#{order.id.slice(0,8).toUpperCase()}</td><td>{item.productTitle}</td><td>{item.quantity}</td><td>{formatXof(item.quantity*item.unitPriceXof)}</td><td>{status[order.status]||order.status}</td><td>{new Intl.DateTimeFormat("fr-FR",{dateStyle:"short"}).format(order.createdAt)}</td></tr>)}</tbody></table></div>}</main>}
