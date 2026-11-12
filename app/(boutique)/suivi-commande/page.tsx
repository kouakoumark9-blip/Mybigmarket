import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { Breadcrumbs } from "@/components/shop/breadcrumbs";
import { getDb } from "@/lib/db";
import { shopOrderItems, shopOrders } from "@/lib/db/schema";
import { SHOP, whatsappLink } from "@/lib/shop/config";
import { formatFcfa } from "@/lib/shop/format";
import { headers } from "next/headers";
import { db as serviceDb } from "@/server/core/db";
import { clientIp } from "@/server/core/http/request-context";
import { enforceRateLimit } from "@/server/core/rate-limit";
import { normalizePhone, statusLabel } from "@/lib/shop/orders";

export const metadata: Metadata = { title: "Suivi de commande", description: "Suivez votre commande MyBigMarket avec votre numéro de commande et votre téléphone.", alternates: { canonical: "/suivi-commande" } };
export const dynamic = "force-dynamic";

export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ numero?: string; telephone?: string }> }) {
  const { numero = "", telephone = "" } = await searchParams;
  const reference = numero.trim().toUpperCase();
  const phone = normalizePhone(telephone);
  let order: typeof shopOrders.$inferSelect | undefined;
  let items: Array<typeof shopOrderItems.$inferSelect> = [];
  const searched = Boolean(reference || telephone);
  let limited = false;
  if (reference && phone && process.env.DATABASE_URL) {
    // Limite les essais pour empêcher de deviner un numéro de commande et un téléphone.
    try { await enforceRateLimit(serviceDb, "shop.track", `ip:${clientIp(await headers()) ?? "unknown"}`); } catch (error) { if ((error as { code?: string }).code === "RATE_LIMITED") limited = true; else throw error; }
  }
  if (reference && phone && !limited && process.env.DATABASE_URL) {
    const db = getDb();
    [order] = await db.select().from(shopOrders).where(and(eq(shopOrders.reference, reference), eq(shopOrders.phone, phone))).limit(1);
    if (order) items = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id));
  }
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <Breadcrumbs items={[{ label: "Accueil", href: "/" }, { label: "Suivi de commande" }]}/>
    <h1 className="mb-title">Suivi de commande</h1>
    <p className="mb-intro">Saisissez le numéro reçu à la commande (par exemple MBM-250101-AB12) et le téléphone utilisé.</p>
    <form className="mb-box" method="get" style={{ maxWidth: 560 }}><div className="mb-box-body mb-form">
      <div className="mb-field"><label htmlFor="s-num">Numéro de commande</label><input id="s-num" name="numero" className="mb-input" defaultValue={numero} placeholder="MBM-250101-AB12" required/></div>
      <div className="mb-field"><label htmlFor="s-tel">Téléphone</label><input id="s-tel" name="telephone" className="mb-input" type="tel" inputMode="tel" defaultValue={telephone} placeholder="07 12 34 56 78" required/></div>
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
