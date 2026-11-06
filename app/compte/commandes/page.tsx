import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, PackageSearch } from "lucide-react";
import { requireUser } from "@/lib/access";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { DestinationPrice } from "@/components/country-preferences";
import { PaymentStatusBanner } from "@/components/payment-status-banner";
import { db as coreDb } from "@/server/core/db";
import { getIntentForCustomer, loadPaymentSettings, paymentMethodAvailability } from "@/server/modules/payments/service";
import { DemoOrdersView } from "@/components/demo-orders-view";

export const metadata: Metadata = { title: "Mes commandes" };
const labels: Record<string, string> = { awaiting_payment:"En attente de paiement", paid_escrow:"Payée · fonds bloqués", seller_confirmed:"Confirmée par le vendeur", received_collection_point:"Au point de collecte", shipped:"Expédiée", arrived_abidjan:"Arrivée à Abidjan", out_for_delivery:"En livraison", delivered:"Livrée", seller_paid:"Vendeur payé", cancelled:"Annulée", dispute:"En litige", refunded:"Remboursée" };

export const dynamic = "force-dynamic";

/** Résultat du paiement au retour de la page du prestataire (?paiement=référence) : statut, et moyens pour réessayer. */
async function paymentFeedback(userId: string, reference: string, orderRows: Array<{ id: string; deliveryAddress: unknown }>) {
  try {
    const database = coreDb();
    const intent = await getIntentForCustomer(database, userId, reference);
    let retryMethods: Array<{ code: string; label: string }> = [];
    if (intent.status !== "succeeded" && intent.status !== "pending") {
      const order = orderRows.find((row) => row.id === intent.orders?.[0]?.id);
      const country = String(((order?.deliveryAddress ?? {}) as Record<string, string>).countryCode || "CI");
      const settings = await loadPaymentSettings(database);
      retryMethods = (await paymentMethodAvailability(database, settings, { countryCode: country, amountXof: intent.amountXof })).filter((entry) => entry.available).map((entry) => ({ code: entry.code, label: entry.label }));
    }
    return { intent, retryMethods };
  } catch {
    return null; // référence inconnue ou paiement d'un autre compte : on n'affiche rien
  }
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ paiement?: string; erreur?: string }> }) {
  if (!process.env.DATABASE_URL) return <DemoOrdersView/>;
  const user = await requireUser();
  const db = getDb();
  const rows = await db.select().from(orders).where(eq(orders.buyerId, user.id)).orderBy(desc(orders.createdAt)).limit(50);
  const query = await searchParams;
  const feedback = query.paiement ? await paymentFeedback(user.id, query.paiement.slice(0, 60), rows) : null;
  return <main className="shell page-space"><div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Mes commandes</span></div><h1 className="page-title">Mes commandes</h1><p className="page-subtitle">Suivez vos précommandes de la confirmation à la livraison.</p>
    {query.erreur && <div className="form-error" role="alert">{query.erreur.slice(0, 240)}</div>}
    {feedback && <PaymentStatusBanner intent={feedback.intent} retryMethods={feedback.retryMethods} formattedAmount={new Intl.NumberFormat("fr-FR").format(feedback.intent.amountXof) + " FCFA"}/>}
    {!rows.length ? <div className="cart-panel cart-empty"><PackageSearch size={34}/><h2>Aucune commande pour le moment</h2><p>Vos achats et leur suivi apparaîtront ici après le paiement.</p><Link className="button button-primary" href="/produits">Découvrir le catalogue</Link></div> : rows.map((order) => <Link href={`/compte/commandes/${order.id}`} className="order-card order-card-link" key={order.id}><div className="order-card-head"><div><b>Commande #{order.id.slice(0,8).toUpperCase()}</b><small>Passée le {new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(order.createdAt)}</small></div><span className="status-pill">{labels[order.status] || order.status}</span></div><div className="order-card-body"><span><DestinationPrice amountXof={order.totalXof} countryCode={order.deliveryAddress?.countryCode}/></span><span className="text-link">Suivre <ArrowRight size={14}/></span></div></Link>)}
  </main>;
}
