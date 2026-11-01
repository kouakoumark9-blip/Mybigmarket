import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Headset, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminConversations, adminEmployees, adminProducts, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const dateLabel = (date: Date) => new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
const kindLabels: Record<string, string> = { supplier: "Fournisseur", support: "Service client" };

export default async function CustomerServicePage() {
  await requireEmployee("support.messages.read");
  const buyer = alias(adminUsers, "conversation_buyer");
  const seller = alias(adminUsers, "conversation_seller");
  const db = getAdminDb();
  const conversations = await db.select({
    id: adminConversations.id,
    kind: adminConversations.kind,
    lastMessageAt: adminConversations.lastMessageAt,
    buyerName: buyer.name,
    sellerName: seller.name,
    productTitle: adminProducts.title,
    assignedEmployeeId: adminConversations.assignedEmployeeId,
  }).from(adminConversations)
    .innerJoin(buyer, eq(adminConversations.buyerId, buyer.id))
    .innerJoin(seller, eq(adminConversations.sellerId, seller.id))
    .leftJoin(adminProducts, eq(adminConversations.productId, adminProducts.id))
    .orderBy(desc(adminConversations.lastMessageAt)).limit(100);
  const employeeIds = [...new Set(conversations.map((row) => row.assignedEmployeeId).filter((id): id is string => Boolean(id)))];
  const employees = employeeIds.length ? await db.select({ id: adminEmployees.id, firstName: adminEmployees.firstName, lastName: adminEmployees.lastName }).from(adminEmployees) : [];
  const employeeNames = new Map(employees.map((employee) => [employee.id, `${employee.firstName} ${employee.lastName}`.trim()]));

  return <>
    <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><strong>Service client</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Service client</h1><p className="admin-page-subtitle">Conversations acheteurs–vendeurs et échanges de support reliés à leurs produits.</p></div></div>
    <Card>
      {conversations.length ? <div className="divide-y divide-slate-100">{conversations.map((conversation) => <Link key={conversation.id} href={`/service-client/${conversation.id}`} className="flex flex-col gap-3 p-5 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><MessageSquareText size={18}/></div><div><h2 className="font-semibold text-slate-950">{conversation.productTitle || "Conversation produit"}</h2><p className="mt-1 text-sm text-slate-600">Acheteur : {conversation.buyerName} · Vendeur : {conversation.sellerName}</p><p className="mt-1 text-xs text-slate-500">{kindLabels[conversation.kind] || conversation.kind} · {conversation.assignedEmployeeId ? `Assignée à ${employeeNames.get(conversation.assignedEmployeeId) || "un employé"}` : "Non assignée"}</p></div></div><div className="whitespace-nowrap text-xs font-medium text-slate-500">Dernier échange : {dateLabel(conversation.lastMessageAt)}</div></Link>)}</div> : <div className="admin-empty"><Headset size={23} className="mb-2 text-slate-400"/><strong>Aucune conversation</strong>Les conversations créées dans la boutique apparaîtront ici. Les messages démo locaux ne sont pas transmis.</div>}
      <div className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">Les réponses envoyées depuis cette vue sont enregistrées comme messages d’employé et visibles dans la conversation côté boutique.</div>
    </Card>
  </>;
}
