import { desc, eq, isNotNull } from "drizzle-orm";
import { RotateCcw, ShieldOff, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminCustomers, adminUsers } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { anonymizeCustomerAction, restoreCustomerAction } from "../actions";

export const dynamic = "force-dynamic";

const noticeText: Record<string, { tone: string; text: string }> = {
  restored: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Client restauré et compte réactivé." },
  anonymized: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Client anonymisé : identité et adresses neutralisées, historique de commandes conservé pour la comptabilité." },
  "already-anonymized": { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Ce client était déjà anonymisé." },
  "open-orders": { tone: "border-red-200 bg-red-50 text-red-800", text: "Action refusée : une commande est encore en cours pour ce client." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Client introuvable." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Demande invalide." },
};

const dateLabel = (date: Date | null) => (date ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—");

export default async function CustomersTrashPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("customers.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const rows = await db.select({
    id: adminCustomers.id,
    name: adminUsers.name,
    email: adminUsers.email,
    deletedAt: adminCustomers.deletedAt,
    anonymizedAt: adminCustomers.anonymizedAt,
    createdAt: adminCustomers.createdAt,
  })
    .from(adminCustomers)
    .innerJoin(adminUsers, eq(adminCustomers.userId, adminUsers.id))
    .where(isNotNull(adminCustomers.deletedAt))
    .orderBy(desc(adminCustomers.deletedAt))
    .limit(100);

  return <>
    <div className="admin-breadcrumb"><span>Relations clients</span><span>/</span><a href="/clients" className="hover:underline">Clients</a><span>/</span><strong>Corbeille</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Corbeille clients</h1><p className="admin-page-subtitle">Les comptes supprimés restent consultables jusqu&apos;à la purge légale. L&apos;anonymisation est définitive.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{rows.length} compte(s)</span>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <Card className="mb-5 overflow-hidden">
      {rows.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]">
        <thead><tr><th>Client</th><th>E-mail</th><th>Supprimé le</th><th>Anonymisé</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td><div className="flex items-center gap-2"><Trash2 size={15} className="shrink-0 text-slate-400"/><strong className="text-slate-900">{row.name}</strong></div></td>
          <td className="text-xs text-slate-600">{row.email}</td>
          <td className="whitespace-nowrap text-xs text-slate-600">{dateLabel(row.deletedAt)}</td>
          <td className="text-xs">{row.anonymizedAt ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900">{dateLabel(row.anonymizedAt)}</span> : "—"}</td>
          <td><div className="flex justify-end gap-2">
            <form action={restoreCustomerAction}><input type="hidden" name="id" value={row.id}/><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"><RotateCcw size={13}/>Restaurer</button></form>
            {!row.anonymizedAt && <form action={anonymizeCustomerAction}><input type="hidden" name="id" value={row.id}/><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"><ShieldOff size={13}/>Anonymiser</button></form>}
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Trash2 size={24} className="mb-2 text-slate-400"/><strong>La corbeille est vide</strong>Les comptes mis à la corbeille apparaîtront ici.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>L&apos;anonymisation est irréversible et refusée tant qu&apos;une commande est ouverte. Les factures et paiements restent intacts : la loi impose leur conservation. Restaurer un client anonymisé ne rétablit pas ses données effacées.</span></div>
    </Card>
  </>;
}
