import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import { requireRole } from "@/lib/access";
import { getDb } from "@/lib/db";
import { quoteRequests, sellerProfiles, users } from "@/lib/db/schema";
import { updateQuoteRequestStatusAction } from "@/actions/quotes";

export const metadata: Metadata = { title: "Demandes de devis reçues" };
const statusLabel: Record<string, string> = { new: "Nouvelle", in_review: "En cours", quoted: "Réponse envoyée", closed: "Clôturée" };
export default async function SellerQuoteRequestsPage() {
  const seller = await requireRole("seller");
  const db = getDb();
  const [profile] = await db.select({ verificationStatus: sellerProfiles.verificationStatus }).from(sellerProfiles).where(eq(sellerProfiles.userId, seller.id)).limit(1);
  if (!profile || profile.verificationStatus !== "approved") return <main className="shell page-space"><h1 className="page-title">Espace vendeur</h1><p className="page-subtitle">Les demandes de devis seront visibles après validation du profil vendeur.</p><Link className="button button-primary" href="/vendeur">Retour à mon espace</Link></main>;
  const rows = await db.select({ request: quoteRequests, buyerName: users.name }).from(quoteRequests).innerJoin(users, eq(users.id, quoteRequests.buyerId))
    .where(and(eq(quoteRequests.sellerId, seller.id), ne(quoteRequests.status, "closed")))
    .orderBy(desc(quoteRequests.createdAt)).limit(100);
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/vendeur">Espace vendeur</Link><span>›</span><span>Demandes de devis</span></div>
    <Link className="back-link" href="/vendeur"><ArrowLeft size={15}/> Retour à mon espace</Link>
    <span className="eyebrow">ACHETEURS INTÉRESSÉS</span><h1 className="page-title">Demandes de devis reçues</h1>
    <p className="page-subtitle">Répondez aux acheteurs dans la messagerie de la plateforme; le prix définitif reste à convenir entre vous.</p>
    {!rows.length ? <div className="cart-panel cart-empty"><MessageSquareText size={34}/><h2>Aucune demande pour l’instant</h2><p>Les demandes liées à vos produits publiés apparaîtront ici.</p><Link className="button button-outline" href="/vendeur/produits">Voir mes produits</Link></div> : <div className="quote-request-list">{rows.map(({ request, buyerName }) => <article className="quote-request-card" key={request.id}>
      <div className="quote-request-head"><span className="quote-kind">DEVIS PRODUIT</span><span className={`quote-status quote-status-${request.status}`}>{statusLabel[request.status] || request.status}</span></div>
      <h2>{request.productTitle}</h2><div className="quote-request-meta"><span>Acheteur : <b>{buyerName}</b></span><span>Quantité : <b>{request.quantity.toLocaleString("fr-FR")}</b></span><span>Livraison : <b>{request.destination}</b></span><span>Contact : <b>{request.contactPhone}</b></span></div>
      {request.message&&<p className="quote-request-message">{request.message}</p>}
      <div className="quote-request-foot"><small>Réf. {request.id.slice(0, 8).toUpperCase()} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(request.createdAt)}</small><span>{statusLabel[request.status]}</span></div>
      <div className="seller-request-actions">{request.conversationId && <Link className="button button-primary" href={`/messages/${request.conversationId}`}><MessageSquareText size={15}/> Répondre à l’acheteur</Link>}<form action={updateQuoteRequestStatusAction} className="quote-status-form"><input type="hidden" name="requestId" value={request.id}/><label htmlFor={`status-${request.id}`}>Statut</label><select id={`status-${request.id}`} name="status" defaultValue={request.status === "new" ? "in_review" : request.status}><option value="in_review">En cours d’examen</option><option value="quoted">Réponse envoyée</option><option value="closed">Clôturer</option></select><button className="button button-outline" type="submit">Mettre à jour</button></form></div>
    </article>)}</div>}
  </main>;
}
