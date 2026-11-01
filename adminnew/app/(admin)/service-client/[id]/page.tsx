import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminConversations, adminEmployees, adminMessages, adminProducts, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { sendEmployeeReplyAction } from "./actions";

export const dynamic = "force-dynamic";
const dateTimeLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  await requireEmployee("support.messages.read");
  const db = getAdminDb();
  const buyer = alias(adminUsers, "thread_buyer");
  const seller = alias(adminUsers, "thread_seller");
  const [conversation] = await db.select({ id: adminConversations.id, buyerName: buyer.name, sellerName: seller.name, productTitle: adminProducts.title })
    .from(adminConversations).innerJoin(buyer, eq(adminConversations.buyerId, buyer.id)).innerJoin(seller, eq(adminConversations.sellerId, seller.id))
    .leftJoin(adminProducts, eq(adminConversations.productId, adminProducts.id)).where(eq(adminConversations.id, id)).limit(1);
  if (!conversation) notFound();
  const senderUser = alias(adminUsers, "message_sender");
  const senderEmployee = alias(adminEmployees, "message_employee");
  const messages = await db.select({ id: adminMessages.id, body: adminMessages.body, authorType: adminMessages.authorType, createdAt: adminMessages.createdAt, userName: senderUser.name, employeeFirstName: senderEmployee.firstName, employeeLastName: senderEmployee.lastName })
    .from(adminMessages).leftJoin(senderUser, eq(adminMessages.senderId, senderUser.id)).leftJoin(senderEmployee, eq(adminMessages.senderEmployeeId, senderEmployee.id))
    .where(eq(adminMessages.conversationId, conversation.id)).orderBy(asc(adminMessages.createdAt));
  const notice = query.notice === "replied" ? "Réponse envoyée et journalisée." : undefined;

  return <>
    <div className="admin-breadcrumb"><Link href="/service-client" className="inline-flex items-center gap-1 hover:text-slate-900"><ArrowLeft size={13}/>Service client</Link><span>/</span><strong>Conversation</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">{conversation.productTitle || "Conversation"}</h1><p className="admin-page-subtitle">Acheteur : {conversation.buyerName} · Vendeur : {conversation.sellerName}</p></div></div>
    {notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">{notice}</p>}
    <Card className="mx-auto max-w-4xl overflow-hidden">
      <div className="divide-y divide-slate-100">{messages.map((message) => { const isEmployee = message.authorType === "employee"; const author = isEmployee ? `${message.employeeFirstName || "Employé"} ${message.employeeLastName || ""}`.trim() : message.userName || (message.authorType === "supplier" ? "Vendeur" : "Client"); return <article key={message.id} className={`p-5 ${isEmployee ? "bg-orange-50/40" : "bg-white"}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-900">{author}</span><time className="text-xs text-slate-500">{dateTimeLabel(message.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{message.body}</p></article>; })}{!messages.length && <div className="admin-empty"><MessageSquareText size={22} className="mb-2 text-slate-400"/><strong>Aucun message</strong>Cette conversation est vide.</div>}</div>
      <form action={sendEmployeeReplyAction} className="grid gap-3 border-t border-slate-200 bg-slate-50 p-5"><input type="hidden" name="conversationId" value={conversation.id}/><label className="grid gap-1.5 text-xs font-semibold text-slate-700">Répondre en tant qu’employé<textarea name="body" required minLength={1} maxLength={3000} rows={4} className="ui-input resize-y" placeholder="Rédige une réponse claire et professionnelle…"/></label><div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Message texte uniquement; aucune donnée ne sera publiée sur la fiche produit.</span><button className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">Envoyer la réponse</button></div></form>
    </Card>
  </>;
}
