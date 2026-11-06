import type { Metadata } from "next";
import Link from "next/link";
import { getLanguage, getTr } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Check, Circle, MapPin, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/access";
import { getDb } from "@/lib/db";
import { orderEvents, orderItems, orders } from "@/lib/db/schema";
import { orderStages } from "@/lib/demo-data";
import { DestinationPrice } from "@/components/country-preferences";
import { ConfirmDeliveryButton } from "@/components/confirm-delivery-button";
import { ReviewForm } from "@/components/review-form";
import { getReviewedProductIds } from "@/lib/reviews";
import { DemoOrderDetailView } from "@/components/demo-orders-view";
import { PayOrderForm } from "@/components/pay-order-form";
import { db as coreDb } from "@/server/core/db";
import { loadPaymentSettings, paymentMethodAvailability } from "@/server/modules/payments/service";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { id } = await params; return { title: `${(await getTr())("Suivi")} ${id.slice(0,8)}` }; }
const statusNames: Record<string,string> = { awaiting_payment:"En attente de paiement",paid_escrow:"Paiement reçu · fonds bloqués",seller_confirmed:"Confirmée par le vendeur",received_collection_point:"Reçue au point de collecte en Chine",shipped:"Expédiée dans le lot",arrived_abidjan:"Arrivée à Abidjan",out_for_delivery:"En livraison",delivered:"Livrée",seller_paid:"Vendeur payé",cancelled:"Annulée",dispute:"En litige",refunded:"Remboursée" };

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  if (!process.env.DATABASE_URL) return <DemoOrderDetailView id={id}/>;
  const user = await requireUser();
  const tr = await getTr();
  const lang = await getLanguage();
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order || order.buyerId !== user.id) notFound();
  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.createdAt)),
  ]);
  // Commande à régler : moyens réellement ouverts pour le pays de livraison.
  let payMethods: Array<{ code: string; label: string }> = [];
  if (order.status === "awaiting_payment") {
    try {
      const database = coreDb();
      const country = String(((order.deliveryAddress ?? {}) as Record<string, string>).countryCode || "CI");
      const settings = await loadPaymentSettings(database);
      payMethods = (await paymentMethodAvailability(database, settings, { countryCode: country, amountXof: order.totalXof })).filter((entry) => entry.available).map((entry) => ({ code: entry.code, label: entry.label }));
    } catch (error) { console.error("order_pay_methods_failed", error instanceof Error ? error.message : error); }
  }
  const canReview = ["delivered", "seller_paid"].includes(order.status);
  const reviewedProductIds = canReview ? await getReviewedProductIds(order.id, user.id) : [];
  const index = orderStages.findIndex((stage) => stage.key === order.status);
  const activeIndex = order.status === "seller_paid" ? orderStages.length - 1 : index;
  const exceptional = ["cancelled", "dispute", "refunded"].includes(order.status);
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">{tr("Accueil")}</Link><span>›</span><Link href="/compte/commandes">{tr("Mes commandes")}</Link><span>›</span><span>{tr("Suivi")}</span></div><h1 className="page-title">{tr("Suivi de commande")}</h1><p className="page-subtitle">{tr("Référence")} #{order.id.slice(0,8).toUpperCase()} · {new Intl.DateTimeFormat(lang,{dateStyle:"long"}).format(order.createdAt)}</p>
    {order.status === "awaiting_payment" && <section className="pay-banner is-pending pay-banner-order"><div><h2>{tr("Cette commande attend votre paiement")}</h2><p>{tr("Réglez-la pour que le vendeur la prépare. Le délai de paiement est limité : sans paiement, la commande est annulée et le stock libéré.")}</p><PayOrderForm orderId={order.id} methods={payMethods}/></div></section>}
    {exceptional && <div className="protected-banner"><ShieldCheck size={17}/><span>{tr("Statut")} : <b>{tr(statusNames[order.status])}</b>. {tr("En cas de litige, les fonds restent bloqués pendant l’examen.")}</span></div>}
    <div className="two-column"><section className="account-panel" style={{padding:16}}><h2 className="panel-title">{tr("Étapes de livraison")}</h2><ol className="timeline">{orderStages.map((stage,i)=>{const done=!exceptional && i<=activeIndex;const current=!exceptional && i===activeIndex;const matched=events.find((event)=>event.status===stage.key);return <li key={stage.key} className={`${done?"done":""} ${current?"current":""}`}><span className="timeline-icon">{done?<Check size={12}/>:<Circle size={8}/>}</span><div className="timeline-copy"><b>{tr(stage.label)}</b><small>{matched?new Intl.DateTimeFormat(lang,{dateStyle:"medium",timeStyle:"short"}).format(matched.createdAt):current?tr("Étape en cours"):tr("À venir")}</small></div></li>})}</ol>{["arrived_abidjan","out_for_delivery"].includes(order.status)&&<ConfirmDeliveryButton orderId={order.id}/>}</section>
      <aside className="summary-card"><h2>{tr("Résumé")}</h2><div className="status-pill">{statusNames[order.status]?tr(statusNames[order.status]):order.status}</div>{items.map((item)=><div className="summary-row" key={item.id}><span>{item.quantity} × {item.productTitle}</span><b><DestinationPrice amountXof={item.quantity*item.unitPriceXof} countryCode={order.deliveryAddress?.countryCode}/></b></div>)}<div className="summary-row total"><span>{tr("Total")}</span><b><DestinationPrice amountXof={order.totalXof} countryCode={order.deliveryAddress?.countryCode}/></b></div><div className="summary-row"><span>{tr("Pays de livraison")}</span><b>{order.deliveryAddress?.countryName || order.deliveryAddress?.countryCode || tr("À confirmer")}</b></div><div className="protected-banner"><MapPin size={15}/><span>{tr("Destination")} : {order.deliveryMethod === "pickup" ? tr("Point relais") : tr("Adresse de livraison")}. {tr("Les frais de transport et douane peuvent être séparés.")}</span></div></aside></div>
    {canReview && <section className="account-panel" style={{padding:16,marginTop:14}}>
      <h2 className="panel-title">{tr("Votre avis après achat")}</h2>
      <p className="page-subtitle">{tr("Seuls les produits de cette commande livrée peuvent être évalués. Chaque avis est vérifié puis publié après modération.")}</p>
      {items.map((item) => <div key={`review-${item.id}`}>
        <div className="summary-row"><span>{item.productTitle}</span>{reviewedProductIds.includes(item.productId) ? <span className="review-verified"><ShieldCheck size={11}/> {tr("avis déposé")}</span> : <small>{tr("déjà commandé")}</small>}</div>
        {!reviewedProductIds.includes(item.productId) && <ReviewForm orderId={order.id} productId={item.productId}/>}
      </div>)}
    </section>}
  </main>;
}
