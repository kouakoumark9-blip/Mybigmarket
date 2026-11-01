import { count, desc, ilike } from "drizzle-orm";
import { FileText, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCreditNotes, adminInvoices } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const invoiceStatus: Record<string, string> = { draft: "Brouillon", issued: "Émise", paid: "Payée (état applicatif)", void: "Annulée" };
const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const dateLabel = (date: Date | null) => date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric" }).format(date) : "—";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireEmployee("orders.documents.manage");
  const params = await searchParams;
  const query = (params.q || "").trim().slice(0, 60);
  const filter = query ? ilike(adminInvoices.invoiceNumber, `%${query}%`) : undefined;
  const db = getAdminDb();
  const [invoices, totalInvoices, creditNotes, totalCredits] = await Promise.all([
    db.select().from(adminInvoices).where(filter).orderBy(desc(adminInvoices.createdAt)).limit(100),
    db.select({ value: count() }).from(adminInvoices),
    db.select().from(adminCreditNotes).orderBy(desc(adminCreditNotes.createdAt)).limit(100),
    db.select({ value: count() }).from(adminCreditNotes),
  ]);

  return <>
    <div className="admin-breadcrumb"><span>Ventes</span><span>/</span><strong>Factures et avoirs</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Factures et avoirs</h1><p className="admin-page-subtitle">Documents enregistrés et liés aux commandes; aucun PDF n’est fabriqué par cette page.</p></div></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-slate-100 p-2.5 text-slate-700"><FileText size={19}/></div><div><div className="text-xs font-semibold text-slate-500">Factures</div><div className="text-xl font-bold text-slate-950">{Number(totalInvoices[0]?.value || 0)}</div></div></Card><Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><ReceiptText size={19}/></div><div><div className="text-xs font-semibold text-slate-500">Avoirs</div><div className="text-xl font-bold text-slate-950">{Number(totalCredits[0]?.value || 0)}</div></div></Card></div>
    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Factures</h2></div>
      <form method="get" className="flex items-end gap-3 border-b border-slate-100 p-4"><label className="grid flex-1 gap-1 text-xs font-semibold text-slate-700">Numéro de facture<input name="q" defaultValue={query} maxLength={60} placeholder="Rechercher une référence" className="ui-input"/></label><button type="submit" className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">Rechercher</button></form>
      {invoices.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[850px]"><thead><tr><th>Facture</th><th>Commande</th><th>Créée / émise</th><th>Sous-total</th><th>Livraison / taxes</th><th>Total</th><th>Statut</th><th>PDF</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td className="font-semibold">{invoice.invoiceNumber}</td><td>{invoice.orderId.slice(0, 8).toUpperCase()}</td><td>{dateLabel(invoice.issuedAt || invoice.createdAt)}</td><td>{money(invoice.subtotalXof)}</td><td>{money(invoice.shippingXof + invoice.taxXof)}</td><td className="font-semibold">{money(invoice.totalXof)}</td><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{invoiceStatus[invoice.status] || invoice.status}</span></td><td>{invoice.pdfUrl ? <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-orange-700 hover:underline">Ouvrir</a> : <span className="text-xs text-slate-400">Non généré</span>}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><FileText size={22} className="mb-2 text-slate-400"/><strong>Aucune facture</strong>Les factures liées aux commandes apparaîtront ici.</div>}
    </Card>
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Avoirs</h2></div>
      {creditNotes.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[700px]"><thead><tr><th>Avoir</th><th>Commande</th><th>Montant</th><th>Motif</th><th>Créé le</th><th>PDF</th></tr></thead><tbody>{creditNotes.map((credit) => <tr key={credit.id}><td className="font-semibold">{credit.creditNoteNumber}</td><td>{credit.orderId.slice(0, 8).toUpperCase()}</td><td className="font-semibold">{money(credit.amountXof)}</td><td className="max-w-sm">{credit.reason}</td><td>{dateLabel(credit.createdAt)}</td><td>{credit.pdfUrl ? <a href={credit.pdfUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-orange-700 hover:underline">Ouvrir</a> : <span className="text-xs text-slate-400">Non généré</span>}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><ReceiptText size={22} className="mb-2 text-slate-400"/><strong>Aucun avoir</strong>Les avoirs émis apparaîtront ici après leur création.</div>}
    </Card>
  </>;
}
