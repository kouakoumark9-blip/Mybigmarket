import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { LifeBuoy } from "lucide-react";
import { NewSupportTicketForm } from "@/components/support-forms";
import { requireUser } from "@/lib/access";
import { db as coreDb } from "@/server/core/db";
import { orders } from "@/lib/db/schema";
import { listCustomerTickets } from "@/server/modules/support/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mes demandes au service client", robots: { index: false } };

const dateLabel = (value: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value);

export default async function SupportPage() {
  if (!process.env.DATABASE_URL) return <main className="shell page-space"><h1 className="page-title">Service client</h1><p className="page-subtitle">Le service client sera disponible dès la mise en service de la base de données.</p></main>;
  const user = await requireUser("/compte/support");
  const db = coreDb();
  const [tickets, recentOrders] = await Promise.all([
    listCustomerTickets(db, user.id),
    db.select({ reference: orders.reference }).from(orders).where(eq(orders.buyerId, user.id)).orderBy(desc(orders.createdAt)).limit(20),
  ]);
  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Service client</span></div>
    <h1 className="page-title">Mes demandes</h1>
    <p className="page-subtitle">Une question sur une commande, un paiement ou une livraison ? Suivez ici vos échanges avec notre équipe.</p>
    {tickets.length === 0 ? <div className="cart-panel cart-empty"><LifeBuoy size={34}/><h2>Aucune demande pour le moment</h2><p>Vos demandes et nos réponses apparaîtront ici.</p></div>
      : <div className="account-panel"><ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>{tickets.map((ticket) => <li key={ticket.reference} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #eee", paddingBottom: 12 }}>
        <div><Link href={`/compte/support/${ticket.reference}`}><b>{ticket.subject}</b></Link><br/><small>{ticket.reference} · dernier message le {dateLabel(ticket.lastMessageAt)}</small></div>
        <span className="eyebrow">{ticket.statusLabel}</span>
      </li>)}</ul></div>}
    <NewSupportTicketForm orderReferences={recentOrders.map((order) => order.reference).filter((reference): reference is string => Boolean(reference))}/>
  </main>;
}
