import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { TICKET_CATEGORY_LABELS, TICKET_CHANNEL_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS, type Ticket } from "@/lib/support-labels";
import { createTicketAction } from "./actions";

export const dynamic = "force-dynamic";

type Overview = { byStatus: Record<string, number>; unassigned: number; overdue: number; assignedToMe: number; last30Days: { averageFirstResponseMinutes: number | null; averageSatisfaction: number | null; ratedTickets: number } };
type Search = { ok?: string; error?: string; statut?: string; vue?: string; q?: string; page?: string };

const statusTone = (status: string) => (status === "open" ? "orange" : status === "awaiting_customer" ? "warning" : "neutral") as "orange" | "warning" | "neutral";
const priorityTone = (priority: string) => (priority === "urgent" ? "danger" : priority === "high" ? "warning" : "neutral") as "danger" | "warning" | "neutral";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireEmployee("support.read");
  const params = await searchParams;
  const header = <PageHeader trail={["Relations clients", "Tickets"]} title="Tickets du service client" subtitle="Demandes des clients (site, formulaire de contact, équipe). Une réponse part par e-mail ; une note interne n’est jamais visible du client."/>;
  const status = params.statut ?? (params.vue ? "" : "open");
  const query: Record<string, string | number | boolean | undefined> = { limit: 30, page: Number(params.page) || 1, q: params.q || undefined, sort: "-lastMessageAt" };
  if (status) query["filter[status]"] = status;
  if (params.vue === "retard") { query.overdue = true; query["filter[status]"] = "open"; }
  if (params.vue === "moi") { query.mine = true; if (!status) query["filter[status]"] = "open"; }
  let data;
  try {
    const [overview, tickets] = await Promise.all([adminApi<Overview>("GET", "/admin/support/overview"), adminApiList<Ticket>("/admin/support/tickets", query)]);
    data = { overview, tickets };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { overview, tickets } = data;
  const filterLink = (label: string, href: string, count: number | null, active: boolean) => <Link href={href} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? "border-orange-500 bg-orange-50 text-orange-900" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}>{label}{count !== null && <span className="ml-1.5 text-slate-500">{count}</span>}</Link>;
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["À traiter", overview.byStatus.open ?? 0],
        ["En retard (1re réponse)", overview.overdue],
        ["Non assignés", overview.unassigned],
        ["Délai moyen de 1re réponse (30 j)", overview.last30Days.averageFirstResponseMinutes == null ? "—" : `${Math.round(overview.last30Days.averageFirstResponseMinutes / 60 * 10) / 10} h`],
      ].map(([label, value]) => <Card key={String(label)} className="p-4"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-950">{value}</div></Card>)}
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {filterLink("À traiter", "/service-client/tickets", overview.byStatus.open ?? 0, status === "open" && !params.vue)}
      {filterLink("Mes tickets", "/service-client/tickets?vue=moi", overview.assignedToMe, params.vue === "moi")}
      {filterLink("En retard", "/service-client/tickets?vue=retard", overview.overdue, params.vue === "retard")}
      {filterLink("En attente du client", "/service-client/tickets?statut=awaiting_customer", overview.byStatus.awaiting_customer ?? 0, status === "awaiting_customer")}
      {filterLink("Résolus", "/service-client/tickets?statut=resolved", overview.byStatus.resolved ?? 0, status === "resolved")}
      {filterLink("Clôturés", "/service-client/tickets?statut=closed", overview.byStatus.closed ?? 0, status === "closed")}
      {filterLink("Tous", "/service-client/tickets?statut=", null, status === "" && !params.vue)}
      <form className="ml-auto flex gap-2" action="/service-client/tickets"><input type="hidden" name="statut" value={status}/><input name="q" defaultValue={params.q} placeholder="Référence, sujet, e-mail…" className="ui-input h-9 w-64"/><button className="ui-button ui-button-outline h-9">Rechercher</button></form>
    </div>
    <Card className="mb-5">
      {tickets.data.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[960px]"><thead><tr><th>Ticket</th><th>Client</th><th>Catégorie</th><th>Priorité</th><th>Statut</th><th>Dernier message</th></tr></thead><tbody>{tickets.data.map((ticket) => <tr key={ticket.id}>
        <td><Link href={`/service-client/tickets/${ticket.id}`} className="font-semibold text-slate-950 hover:underline">{ticket.subject}</Link><div className="font-mono text-[11px] text-slate-500">{ticket.reference} · {TICKET_CHANNEL_LABELS[ticket.channel] ?? ticket.channel}</div></td>
        <td><div className="text-sm">{ticket.name ?? "—"}</div><div className="text-[11px] text-slate-500">{ticket.email}</div></td>
        <td className="text-sm">{TICKET_CATEGORY_LABELS[ticket.category] ?? ticket.category}</td>
        <td><Badge tone={priorityTone(ticket.priority)}>{TICKET_PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Badge></td>
        <td><div className="flex flex-wrap gap-1"><Badge tone={statusTone(ticket.status)}>{TICKET_STATUS_LABELS[ticket.status] ?? ticket.statusLabel}</Badge>{ticket.overdue && <Badge tone="danger">En retard</Badge>}{!ticket.assignedEmployeeId && ticket.status === "open" && <Badge>Non assigné</Badge>}</div></td>
        <td className="text-xs text-slate-600">{formatDate(ticket.lastMessageAt)}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Inbox size={22} className="mb-2 text-slate-400"/><strong>Aucun ticket</strong>Aucune demande ne correspond à ce filtre.</div>}
      {tickets.meta.totalPages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600"><span>Page {tickets.meta.page} sur {tickets.meta.totalPages} · {tickets.meta.total} tickets</span><div className="flex gap-3">
        {tickets.meta.page > 1 && <Link className="font-semibold hover:underline" href={`/service-client/tickets?${new URLSearchParams({ ...(params.statut !== undefined ? { statut: params.statut } : {}), ...(params.vue ? { vue: params.vue } : {}), ...(params.q ? { q: params.q } : {}), page: String(tickets.meta.page - 1) })}`}>Précédente</Link>}
        {tickets.meta.page < tickets.meta.totalPages && <Link className="font-semibold hover:underline" href={`/service-client/tickets?${new URLSearchParams({ ...(params.statut !== undefined ? { statut: params.statut } : {}), ...(params.vue ? { vue: params.vue } : {}), ...(params.q ? { q: params.q } : {}), page: String(tickets.meta.page + 1) })}`}>Suivante</Link>}
      </div></div>}
    </Card>
    <Card className="p-5">
      <h2 className="mb-1 font-bold text-slate-950">Ouvrir un ticket pour un client</h2>
      <p className="mb-4 text-sm text-slate-600">Pour une demande reçue par téléphone, WhatsApp ou e-mail. Le client reçoit un accusé de réception avec un lien de suivi.</p>
      <form action={createTicketAction} className="grid gap-4 md:grid-cols-3">
        <Field label="E-mail du client"><input name="email" type="email" required maxLength={190} className="ui-input"/></Field>
        <Field label="Nom"><input name="name" maxLength={160} className="ui-input"/></Field>
        <Field label="Canal"><select name="channel" className="ui-input">{["phone", "whatsapp", "email", "admin"].map((value) => <option key={value} value={value}>{TICKET_CHANNEL_LABELS[value]}</option>)}</select></Field>
        <Field label="Sujet" className="md:col-span-3"><input name="subject" required minLength={3} maxLength={200} className="ui-input"/></Field>
        <Field label="Demande du client" className="md:col-span-3"><textarea name="message" required minLength={2} rows={4} className="ui-input !h-auto py-2"/></Field>
        <Field label="Catégorie"><select name="category" className="ui-input">{Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Priorité"><select name="priority" defaultValue="normal" className="ui-input">{Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <div className="flex items-end"><button className="ui-button ui-button-primary">Créer le ticket</button></div>
      </form>
    </Card>
  </>;
}
