import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowRight, ClipboardList, MessageSquareText } from "lucide-react";
import { requireRole } from "@/lib/access";
import { getDb } from "@/lib/db";
import { quoteRequests, users } from "@/lib/db/schema";
import { DemoInquiriesView } from "@/components/demo-inquiries-view";

export const metadata: Metadata = { title: "Mes demandes de devis" };
export const dynamic = "force-dynamic";
const statusLabel: Record<string, string> = { new: "Nouvelle", in_review: "En cours d’examen", quoted: "Réponse disponible", closed: "Clôturée" };
export default async function BuyerInquiriesPage() {
  if (!process.env.DATABASE_URL) return <DemoInquiriesView/>;
  const buyer = await requireRole("buyer");
  const db = getDb();
  const rows = await db.select({ request: quoteRequests, sellerName: users.name }).from(quoteRequests)
    .leftJoin(users, eq(users.id, quoteRequests.sellerId)).where(eq(quoteRequests.buyerId, buyer.id))
    .orderBy(desc(quoteRequests.createdAt)).limit(100);
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Mes demandes de devis</span></div>
    <span className="eyebrow">SOURCING & ACHAT DE GROS</span><h1 className="page-title">Mes demandes de devis</h1>
    <p className="page-subtitle">Retrouvez ici vos demandes et les réponses des vendeurs ou de l’équipe sourcing.</p>
    <div className="quote-dashboard-actions"><Link className="button button-primary" href="/demande-de-devis">Créer une demande de sourcing <ArrowRight size={15}/></Link><Link className="button button-outline" href="/produits">Parcourir les produits</Link></div>
    {!rows.length ? <div className="cart-panel cart-empty"><MessageSquareText size={34}/><h2>Aucune demande enregistrée</h2><p>Demandez un devis depuis une fiche produit ou décrivez ce que vous souhaitez sourcer.</p><Link className="button button-primary" href="/demande-de-devis">Créer ma première demande</Link></div> : <div className="quote-request-list">{rows.map(({ request, sellerName }) => <article className="quote-request-card" key={request.id}>
      <div className="quote-request-head"><span className="quote-kind">{request.kind === "product" ? "DEVIS PRODUIT" : "SOURCING"}</span><span className={`quote-status quote-status-${request.status}`}>{statusLabel[request.status] || request.status}</span></div>
      <h2>{request.productTitle}</h2><div className="quote-request-meta"><span>Quantité : <b>{request.quantity.toLocaleString("fr-FR")}</b></span><span>Destination : <b>{request.destination}</b></span>{sellerName&&<span>Vendeur : <b>{sellerName}</b></span>}<span>Contact : <b>{request.contactPhone}</b></span></div>
      {request.message&&<p className="quote-request-message">{request.message}</p>}
      <div className="quote-request-foot"><small>Réf. {request.id.slice(0, 8).toUpperCase()} · {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(request.createdAt)}</small><span><ClipboardList size={14}/> Enregistrée sur mybigmarket</span></div>
      {request.conversationId && <Link className="button button-outline quote-conversation-link" href={`/messages/${request.conversationId}`}><MessageSquareText size={15}/> Ouvrir la conversation</Link>}
    </article>)}</div>}
  </main>;
}
