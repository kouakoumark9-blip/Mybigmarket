import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Breadcrumbs } from "@/components/shop/breadcrumbs";
import { getDb } from "@/lib/db";
import { shopOrderItems, shopOrders } from "@/lib/db/schema";
import { SHOP, whatsappLink } from "@/lib/shop/config";
import { formatFcfa } from "@/lib/shop/format";
import { trackOrderAction } from "@/actions/shop-order";
import { isValidOrderAccessKey } from "@/lib/shop/order-access";
import { statusLabel } from "@/lib/shop/orders";

export const metadata: Metadata = { title: "Suivi de commande", description: "Suivez votre commande MyBigMarket avec votre numéro de commande et votre téléphone.", alternates: { canonical: "/suivi-commande" } };
export const dynamic = "force-dynamic";

export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ numero?: string; k?: string; erreur?: string }> }) {
  const { numero = "", k, erreur } = await searchParams;
  const reference = numero.trim().toUpperCase();
  let order: typeof shopOrders.$inferSelect | undefined;
  let items: Array<typeof shopOrderItems.$inferSelect> = [];
  // La commande ne s'affiche qu'avec le lien signé délivré après la saisie du numéro et du téléphone.
  if (reference && isValidOrderAccessKey(reference, k) && process.env.DATABASE_URL) {
    const db = getDb();
    [order] = await db.select().from(shopOrders).where(eq(shopOrders.reference, reference)).limit(1);
    if (order) items = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id));
  }
  const limited = erreur === "limite";
  const searched = erreur === "introuvable" || Boolean(reference && !order);
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Suivi de commande" }]}/>
    <h1 className="mb-title">Suivi de commande</h1>
    <p className="mb-intro">Saisissez le numéro reçu à la commande (par exemple MBM-250101-AB12) et le téléphone utilisé.</p>
    <form className="mb-box" action={trackOrderAction} style={{ maxWidth: 560 }}><div className="mb-box-body mb-form">
      <div className="mb-field"><label htmlFor="s-num">Numéro de commande</label><input id="s-num" name="numero" className="mb-input" defaultValue={reference} placeholder="MBM-250101-AB12" required/></div>
      <div className="mb-field"><label htmlFor="s-tel">Téléphone</label><input id="s-tel" name="telephone" className="mb-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="07 12 34 56 78" required/></div>
      <button className="mb-btn" type="submit">Voir ma commande</button>
    </div></form>
    {order && <section className="mb-box" style={{ marginTop: 16, maxWidth: 560 }} aria-live="polite"><h2>Commande {order.reference} : {statusLabel(order.status)}</h2><div className="mb-box-body">
      {items.map((item) => <div key={item.id} className="mb-summary-row"><span>{item.quantity} × {item.title}</span><b>{formatFcfa(item.unitPriceXof * item.quantity)}</b></div>)}
      <div className="mb-summary-row mb-summary-row--total"><span>Total</span><span>{formatFcfa(order.totalXof)}</span></div>
      <p style={{ margin: "10px 0 0" }}><a className="mb-link" href={whatsappLink(`Bonjour, je voudrais des nouvelles de la commande ${order.reference}.`)} rel="noopener">Une question ? WhatsApp {SHOP.phoneDisplay}</a></p>
    </div></section>}
    {limited && <div className="mb-notice mb-notice--error" style={{ marginTop: 16, maxWidth: 560 }} role="alert">Trop de recherches depuis cette connexion. Réessayez dans quelques minutes, ou écrivez-moi sur WhatsApp.</div>}
    {searched && !order && !limited && <div className="mb-notice mb-notice--error" style={{ marginTop: 16, maxWidth: 560 }} role="alert">Aucune commande ne correspond à ce numéro et à ce téléphone. Vérifiez-les, ou écrivez-moi sur WhatsApp.</div>}
  </div>;
}
