import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { SupportRatingForm, SupportReplyForm } from "@/components/support-forms";
import { db as coreDb } from "@/server/core/db";
import { getCustomerTicket } from "@/server/modules/support/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ma demande", robots: { index: false } };
type Props = { params: Promise<{ reference: string }>; searchParams: Promise<{ cle?: string }> };

const dateLabel = (value: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value);

/** Conversation d'une demande : compte propriétaire, ou lien signé reçu par e-mail (client sans compte). */
export default async function SupportTicketPage({ params, searchParams }: Props) {
  const { reference } = await params;
  const { cle } = await searchParams;
  if (!process.env.DATABASE_URL) notFound();
  if (!/^TCK-\d{6}-[A-Z0-9]{6}$/.test(reference)) notFound();
  const session = await auth();
  if (!session?.user?.id && !cle) redirect(`/connexion?callbackUrl=${encodeURIComponent(`/compte/support/${reference}`)}`);
  const ticket = await getCustomerTicket(coreDb(), reference, { userId: session?.user?.id, key: cle }).catch(() => null);
  if (!ticket) notFound();
  const accessKey = cle ?? null;
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span>{session?.user?.id ? <Link href="/compte/support">Mes demandes</Link> : <span>Service client</span>}<span>›</span><span>{ticket.reference}</span></div>
    <div className="messages-heading"><div><span className="eyebrow">{ticket.statusLabel.toUpperCase()}</span><h1 className="page-title">{ticket.subject}</h1><p className="page-subtitle">Demande {ticket.reference}{ticket.orderReference ? ` · commande ${ticket.orderReference}` : ""} · ouverte le {dateLabel(ticket.createdAt)}</p></div></div>
    <section className="messages-chat messages-chat-page" aria-label={`Échanges de la demande ${ticket.reference}`}>
      <div className="messages-bubbles">{ticket.messages.map((message) => <div className={`message-bubble ${message.from === "customer" ? "buyer-bubble" : "seller-bubble"}`} key={message.id}><b>{message.from === "customer" ? "Vous" : "Service client"}</b><span style={{ whiteSpace: "pre-line" }}>{message.body}</span><time>{dateLabel(message.createdAt)}</time></div>)}</div>
      {ticket.canReply ? <SupportReplyForm reference={ticket.reference} accessKey={accessKey}/> : <p className="messages-first-hint">Cette demande est clôturée. Pour une nouvelle question, ouvrez une nouvelle demande.</p>}
    </section>
    {ticket.canRate && <SupportRatingForm reference={ticket.reference} accessKey={accessKey}/>}
    {ticket.satisfactionScore !== null && <p className="page-subtitle">Merci pour votre avis : {ticket.satisfactionScore}/5.</p>}
  </main>;
}
