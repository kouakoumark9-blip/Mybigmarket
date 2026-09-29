import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { MessageCircle } from "lucide-react";
import { DemoMessenger } from "@/components/demo-messenger";
import { requireUser } from "@/lib/access";
import { getDb } from "@/lib/db";
import { conversations, products, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ma messagerie" };
type Props = { searchParams: Promise<{ demo?: string; info?: string; erreur?: string }> };

export default async function MessagesPage({ searchParams }: Props) {
  const params = await searchParams;
  if (!process.env.DATABASE_URL) return <DemoMessenger initialSlug={params.demo}/>;
  const current = await requireUser("/messages");
  const buyer = alias(users, "message_buyer");
  const seller = alias(users, "message_seller");
  const db = getDb();
  const rows = await db.select({
    id: conversations.id, buyerId: conversations.buyerId, sellerId: conversations.sellerId,
    lastMessageAt: conversations.lastMessageAt, productTitle: products.title, productSlug: products.slug,
    buyerName: buyer.name, sellerName: seller.name,
  }).from(conversations)
    .innerJoin(products, eq(products.id, conversations.productId))
    .innerJoin(buyer, eq(buyer.id, conversations.buyerId))
    .innerJoin(seller, eq(seller.id, conversations.sellerId))
    .where(or(eq(conversations.buyerId, current.id), eq(conversations.sellerId, current.id)))
    .orderBy(desc(conversations.lastMessageAt)).limit(100);
  const notice = params.info === "acheteur" ? "Les comptes vendeurs peuvent répondre depuis leur boîte de réception. Pour contacter un autre vendeur, utilisez un compte acheteur." : params.erreur ? "La conversation n’a pas pu être ouverte. Vérifiez que le produit et le vendeur sont toujours actifs." : "";
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Messages</span></div>
    <div className="messages-heading"><div><span className="eyebrow">ÉCHANGES AVEC LES VENDEURS</span><h1 className="page-title">Ma messagerie</h1><p className="page-subtitle">Posez vos questions et échangez directement dans mybigmarket.</p></div><Link className="button button-outline" href="/produits">Parcourir les produits</Link></div>
    {notice && <p className="messages-notice" role="status">{notice}</p>}
    <section className="messages-inbox-list" aria-label="Liste des conversations">{rows.length === 0 ? <div className="messages-empty cart-panel"><MessageCircle size={34}/><h2>Aucune conversation pour le moment</h2><p>Depuis une fiche produit, sélectionnez « Écrire au vendeur » pour démarrer un échange privé.</p><Link className="button button-primary" href="/produits">Découvrir le catalogue</Link></div> : rows.map((row) => {
      const counterpart = row.buyerId === current.id ? row.sellerName : row.buyerName;
      return <Link href={`/messages/${row.id}`} className="messages-inbox-item" key={row.id}><span className="messages-avatar">{counterpart.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><span className="messages-inbox-copy"><b>{counterpart}</b><span>{row.productTitle}</span><small>Conversation liée au produit · ouvrir les messages</small></span><time>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(row.lastMessageAt)}</time></Link>;
    })}</section>
  </main>;
}
