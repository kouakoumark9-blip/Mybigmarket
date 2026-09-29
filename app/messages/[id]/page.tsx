import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { sendMessageAction } from "@/actions/messages";
import { MessagesAutoRefresh } from "@/components/messages-auto-refresh";
import { requireUser } from "@/lib/access";
import { getDb } from "@/lib/db";
import { conversations, messages, products, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversation" };
type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  if (!process.env.DATABASE_URL) redirect("/messages");
  const current = await requireUser(`/messages/${encodeURIComponent(id)}`);
  const buyer = alias(users, "conversation_buyer");
  const seller = alias(users, "conversation_seller");
  const db = getDb();
  const [thread] = await db.select({
    id: conversations.id, buyerId: conversations.buyerId, sellerId: conversations.sellerId,
    productTitle: products.title, productSlug: products.slug,
    buyerName: buyer.name, sellerName: seller.name,
  }).from(conversations)
    .innerJoin(products, eq(products.id, conversations.productId))
    .innerJoin(buyer, eq(buyer.id, conversations.buyerId))
    .innerJoin(seller, eq(seller.id, conversations.sellerId))
    .where(eq(conversations.id, id)).limit(1);
  if (!thread || (thread.buyerId !== current.id && thread.sellerId !== current.id)) notFound();

  await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.conversationId, thread.id), ne(messages.senderId, current.id), isNull(messages.readAt)));
  const sender = alias(users, "message_sender");
  const history = await db.select({ id: messages.id, senderId: messages.senderId, senderName: sender.name, body: messages.body, createdAt: messages.createdAt })
    .from(messages).innerJoin(sender, eq(sender.id, messages.senderId))
    .where(eq(messages.conversationId, thread.id)).orderBy(asc(messages.createdAt)).limit(300);
  const otherName = current.id === thread.buyerId ? thread.sellerName : thread.buyerName;
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/messages">Messages</Link><span>›</span><span>{otherName}</span></div>
    <div className="messages-heading"><div><span className="eyebrow">CONVERSATION PRIVÉE</span><h1 className="page-title">Avec {otherName}</h1><p className="page-subtitle">À propos de : <Link href={`/produits/${thread.productSlug}`}>{thread.productTitle}</Link></p></div><Link className="button button-outline" href="/messages"><ArrowLeft size={15}/> Toutes les conversations</Link></div>
    <section className="messages-chat messages-chat-page" aria-label={`Messages avec ${otherName}`}>
      <header className="messages-chat-head"><div><b>{otherName}</b><span>{current.id === thread.sellerId ? "Acheteur" : "Vendeur"} · {thread.productTitle}</span></div><div className="messages-chat-tools"><MessagesAutoRefresh/><Link href={`/produits/${thread.productSlug}`}>Voir la fiche produit</Link></div></header>
      <div className="messages-bubbles">{history.length === 0 ? <p className="messages-first-hint">Commencez la conversation. Vous pouvez demander des précisions sur les variantes, le prix, le minimum de commande ou la livraison.</p> : history.map((message) => <div className={`message-bubble ${message.senderId === current.id ? "buyer-bubble" : "seller-bubble"}`} key={message.id}><b>{message.senderId === current.id ? "Vous" : message.senderName}</b><span>{message.body}</span><time>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(message.createdAt)}</time></div>)}</div>
      <form action={sendMessageAction} className="message-compose"><input type="hidden" name="conversationId" value={thread.id}/><label htmlFor="conversation-message">Écrire un message au sujet de ce produit</label><textarea id="conversation-message" name="body" maxLength={2000} minLength={1} required placeholder="Bonjour, pourriez-vous confirmer le prix et les variantes disponibles ?"/><div><small>Maximum 2 000 caractères</small><button className="button button-primary" type="submit"><Send size={15}/> Envoyer</button></div></form>
    </section>
  </main>;
}
