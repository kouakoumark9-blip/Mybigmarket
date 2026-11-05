import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft, Bot, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate, formatXof } from "@/components/admin/page";
import { adminApi, adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { getAdminDb } from "@/lib/db";
import { adminEmployees } from "@/lib/db/schema";
import { isAiAssistantEnabled } from "@/lib/ai-feature";
import { requireEmployee } from "@/lib/permissions";
import { can, isPermissionCode } from "@/lib/permission-matrix";
import { TICKET_CATEGORY_LABELS, TICKET_CHANNEL_LABELS, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS, type Proposal, type ReplyTemplate, type TicketDetail } from "@/lib/support-labels";
import * as actions from "../actions";

export const dynamic = "force-dynamic";

type Search = { ok?: string; error?: string; draft?: string; template?: string; proposal?: string };
type ReplyProposal = { reply: string; suggestedStatus: string; confidence: string; missingInformation: string[] };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const employee = await requireEmployee("support.read");
  const { id } = await params;
  const search = await searchParams;
  const allowed = (code: string) => (isPermissionCode(code) ? can(employee.permissions, code) : employee.permissions.includes(code));
  const aiOn = isAiAssistantEnabled() && allowed("ai.use");
  const header = (title: string) => <PageHeader trail={["Relations clients", "Tickets", title]} title={title} actions={<Link href="/service-client/tickets" className="ui-button ui-button-outline"><ArrowLeft size={15}/> Tous les tickets</Link>}/>;
  let data;
  try {
    const [ticket, templates, proposals, staff] = await Promise.all([
      adminApi<TicketDetail>("GET", `/admin/support/tickets/${id}`),
      adminApi<ReplyTemplate[]>("GET", "/admin/support/templates", { query: { active: true } }),
      aiOn ? adminApiList<Proposal>("/admin/ai/proposals", { "filter[targetId]": id, "filter[status]": "pending", limit: 5, sort: "-createdAt" }).catch(() => ({ data: [] as Proposal[] })) : Promise.resolve({ data: [] as Proposal[] }),
      getAdminDb().select({ id: adminEmployees.id, firstName: adminEmployees.firstName, lastName: adminEmployees.lastName }).from(adminEmployees).where(eq(adminEmployees.status, "active")),
    ]);
    data = { ticket, templates, proposals: proposals.data, staff };
  } catch (error) {
    return <>{header("Ticket")}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { ticket, templates, proposals, staff } = data;
  const proposal = proposals.find((entry) => entry.id === search.proposal) ?? proposals[0];
  const draft = proposal?.proposal as ReplyProposal | undefined;
  const closed = ticket.status === "closed";

  return <>
    {header(ticket.subject)}
    <Notice ok={search.ok} error={search.error}/>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-5">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-mono">{ticket.reference}</span>·<span>{TICKET_CHANNEL_LABELS[ticket.channel] ?? ticket.channel}</span>·<span>ouvert le {formatDate(ticket.createdAt)}</span>
            <Badge tone={ticket.status === "open" ? "orange" : "neutral"}>{TICKET_STATUS_LABELS[ticket.status] ?? ticket.statusLabel}</Badge>
            {ticket.overdue && <Badge tone="danger">1re réponse en retard</Badge>}
          </div>
          <ol className="grid gap-3">
            {ticket.messages.map((message) => {
              const fromCustomer = message.authorType === "customer";
              return <li key={message.id} className={`rounded-lg border p-4 ${message.isInternal ? "border-amber-200 bg-amber-50" : fromCustomer ? "border-slate-200 bg-white" : "border-orange-100 bg-orange-50/40"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                  {message.isInternal && <Lock size={13}/>}
                  <span>{fromCustomer ? ticket.name ?? ticket.email : message.authorType === "system" ? "Système" : message.employeeName ?? "Équipe"}</span>
                  {message.isInternal && <Badge tone="warning">Note interne</Badge>}
                  {message.fromAssistant && <Badge>Rédigé avec l’assistant</Badge>}
                  <span className="ml-auto font-normal text-slate-500">{formatDate(message.createdAt)}</span>
                </div>
                <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{message.body}</p>
              </li>;
            })}
          </ol>
        </Card>

        {aiOn && !closed && <Card className="p-5" id="assistant">
          <h2 className="mb-1 flex items-center gap-2 font-bold text-slate-950"><Bot size={17}/> Assistant IA</h2>
          {draft && proposal ? <>
            <p className="mb-3 text-sm text-slate-600">Brouillon proposé (confiance : {draft.confidence === "high" ? "élevée" : draft.confidence === "medium" ? "moyenne" : "faible"}). Rien n’a été envoyé : relisez, modifiez si besoin, puis envoyez.</p>
            {draft.missingInformation.length > 0 && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">À vérifier avant d’envoyer : {draft.missingInformation.join(" · ")}</p>}
            <form action={actions.applyReplyProposalAction} className="grid gap-3">
              <input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="proposalId" value={proposal.id}/>
              <textarea name="reply" defaultValue={draft.reply} rows={8} className="ui-input !h-auto py-2"/>
              <div className="flex flex-wrap items-center gap-3">
                <button className="ui-button ui-button-primary">Envoyer cette réponse au client</button>
                <span className="text-xs text-slate-500">Statut ensuite : {TICKET_STATUS_LABELS[draft.suggestedStatus] ?? draft.suggestedStatus}</span>
              </div>
            </form>
            <form action={actions.rejectProposalFromTicketAction} className="mt-2"><input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="proposalId" value={proposal.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Refuser ce brouillon</button></form>
          </> : <form action={actions.proposeReplyAction} className="grid gap-3">
            <p className="text-sm text-slate-600">L’assistant prépare un brouillon à partir des messages et de la commande du client. Rien n’est envoyé sans votre confirmation.</p>
            <input type="hidden" name="ticketId" value={ticket.id}/>
            <input name="instructions" maxLength={1000} placeholder="Consignes facultatives (ex. proposer un appel, rester bref)" className="ui-input"/>
            <div><button className="ui-button ui-button-outline"><Bot size={15}/> Proposer une réponse</button></div>
          </form>}
        </Card>}

        {allowed("support.update") && !closed && <Card className="p-5" id="reponse">
          <h2 className="mb-3 font-bold text-slate-950">Répondre</h2>
          {templates.length > 0 && <form action={actions.useTemplateAction} className="mb-3 flex flex-wrap gap-2">
            <input type="hidden" name="ticketId" value={ticket.id}/>
            <select name="templateId" defaultValue={search.template} className="ui-input h-9 max-w-sm">{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select>
            <button className="ui-button ui-button-outline h-9">Insérer le modèle</button>
          </form>}
          <form action={actions.replyTicketAction} className="grid gap-3">
            <input type="hidden" name="ticketId" value={ticket.id}/>
            {search.template && <input type="hidden" name="templateId" value={search.template}/>}
            <textarea name="body" required minLength={2} rows={7} defaultValue={search.draft ?? ""} placeholder="Votre réponse au client…" className="ui-input !h-auto py-2"/>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="reply" defaultChecked/> Réponse au client (e-mail)</label>
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="internal"/> Note interne</label>
              <select name="status" defaultValue="awaiting_customer" className="ui-input h-9 w-auto"><option value="awaiting_customer">Puis : en attente du client</option><option value="resolved">Puis : résolu</option><option value="open">Puis : reste à traiter</option></select>
              <button className="ui-button ui-button-primary ml-auto">Envoyer</button>
            </div>
          </form>
        </Card>}
      </div>

      <div className="grid content-start gap-5">
        <Card className="p-5">
          <h2 className="mb-3 font-bold text-slate-950">Suivi</h2>
          <form action={actions.updateTicketAction} className="grid gap-3">
            <input type="hidden" name="ticketId" value={ticket.id}/><input type="hidden" name="version" value={ticket.version}/>
            <Field label="Statut"><select name="status" defaultValue={ticket.status} className="ui-input">{Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Priorité"><select name="priority" defaultValue={ticket.priority} className="ui-input">{Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Catégorie"><select name="category" defaultValue={ticket.category} className="ui-input">{Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            {allowed("support.assign") && <Field label="Assigné à"><select name="assignedEmployeeId" defaultValue={ticket.assignedEmployeeId ?? ""} className="ui-input"><option value="">Personne</option>{staff.map((member) => <option key={member.id} value={member.id}>{`${member.firstName} ${member.lastName}`.trim()}</option>)}</select></Field>}
            {allowed("support.update") && <button className="ui-button ui-button-outline">Enregistrer</button>}
          </form>
          {!allowed("support.assign") && ticket.assignee && <p className="mt-3 text-xs text-slate-500">Assigné à {ticket.assignee.name}</p>}
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="mb-3 font-bold text-slate-950">Client</h2>
          <div className="font-semibold">{ticket.customer?.name ?? ticket.name ?? "—"}</div>
          <div className="text-slate-600">{ticket.email}</div>
          {ticket.customer ? <>
            <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Dernières commandes</h3>
            {ticket.customer.recentOrders.length ? <ul className="grid gap-2">{ticket.customer.recentOrders.map((order) => <li key={order.id}><Link href={`/commandes/${order.id}`} className="font-mono text-xs font-semibold hover:underline">{order.reference ?? order.id.slice(0, 8)}</Link><span className="ml-2 text-xs text-slate-500">{formatXof(order.totalXof)} · {order.status}</span></li>)}</ul> : <p className="text-xs text-slate-500">Aucune commande.</p>}
          </> : <p className="mt-2 text-xs text-slate-500">Client sans compte : il suit sa demande par le lien reçu par e-mail.</p>}
          {ticket.satisfactionScore != null && <p className="mt-4 text-xs">Satisfaction : <b>{ticket.satisfactionScore}/5</b>{ticket.satisfactionComment ? ` — « ${ticket.satisfactionComment} »` : ""}</p>}
        </Card>
      </div>
    </div>
  </>;
}
