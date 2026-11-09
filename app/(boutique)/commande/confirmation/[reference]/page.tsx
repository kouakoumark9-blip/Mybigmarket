import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shopOrderItems, shopOrders } from "@/lib/db/schema";
import { SHOP, whatsappLink } from "@/lib/shop/config";
import { formatFcfa } from "@/lib/shop/format";
import { statusLabel } from "@/lib/shop/orders";

export const metadata: Metadata = { title: "Commande enregistrée", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!/^MBM-\d{6}-[A-Z0-9]{4}$/.test(reference) || !process.env.DATABASE_URL) notFound();
  const db = getDb();
  const [order] = await db.select().from(shopOrders).where(eq(shopOrders.reference, reference)).limit(1);
  if (!order) notFound();
  const items = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id));
  const lines = items.map((item) => `- ${item.quantity} x ${item.title} (${formatFcfa(item.unitPriceXof * item.quantity)})`).join("\n");
  const message = `Bonjour MyBigMarket, je viens de passer la commande ${order.reference}.\n${lines}\nTotal : ${formatFcfa(order.totalXof)} (livraison ${order.commune}).\nNom : ${order.customerName}\nMerci de me confirmer la livraison.`;
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <div className="mb-confirm">
      <CheckCircle2 size={44} strokeWidth={1.5} aria-hidden="true" style={{ color: "#0b7a3b" }}/>
      <h1 className="mb-title" style={{ marginTop: 8 }}>Merci, votre commande est enregistrée</h1>
      <div className="mb-confirm-ref" aria-label={`Numéro de commande ${order.reference}`}>{order.reference}</div>
      <p className="mb-intro" style={{ marginInline: "auto" }}>Gardez ce numéro. Je vous contacte sur le {order.phone.replace(/(\d{2})(?=\d)/g, "$1 ")} pour confirmer la livraison. Vous payez à la livraison.</p>
      <a className="mb-btn mb-btn--whatsapp" href={`https://wa.me/${SHOP.whatsappNumber}?text=${encodeURIComponent(message)}`} rel="noopener">Envoyer ma commande sur WhatsApp</a>
      <div className="mb-box" style={{ marginTop: 20, textAlign: "left" }}>
        <h2>Récapitulatif · {statusLabel(order.status)}</h2>
        <div className="mb-box-body">
          {items.map((item) => <div key={item.id} className="mb-summary-row"><span>{item.quantity} × {item.title}<br/><small style={{ color: "#5b6577" }}>{item.availabilityLabel}</small></span><b>{formatFcfa(item.unitPriceXof * item.quantity)}</b></div>)}
          <div className="mb-summary-row"><span>Livraison ({order.commune})</span><b>{formatFcfa(order.deliveryFeeXof)}</b></div>
          <div className="mb-summary-row mb-summary-row--total"><span>Total à payer</span><span>{formatFcfa(order.totalXof)}</span></div>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#5b6577" }}>Adresse : {order.address}</p>
        </div>
      </div>
      <p style={{ marginTop: 16 }}>Une question ? <a className="mb-link" href={whatsappLink(`Bonjour, une question sur la commande ${order.reference}.`)} rel="noopener">Écrivez-moi sur WhatsApp</a>.</p>
    </div>
  </div>;
}
