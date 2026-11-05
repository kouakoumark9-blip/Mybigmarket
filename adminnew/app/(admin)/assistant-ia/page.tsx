import Link from "next/link";
import { Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, adminApiList, apiErrorMessage } from "@/lib/admin-api";
import type { ProductListItem } from "@/lib/api-types";
import { requireEmployee } from "@/lib/permissions";
import { can, isPermissionCode } from "@/lib/permission-matrix";
import { PRODUCT_FIELD_LABELS, PROPOSAL_KIND_LABELS, PROPOSAL_STATUS_LABELS, type Proposal } from "@/lib/support-labels";
import * as actions from "./actions";
import { NaturalSearchTool, SalesSummaryTool } from "./assistant-tools";

export const dynamic = "force-dynamic";

type Status = { available: boolean; configured: boolean; enabled: boolean; model: string; quotas: { dailyRequestsPerEmployee: number; usedToday: number; monthlyTokenBudget: number; tokensThisMonth: number } };
type FieldChange = { current: unknown; proposed: unknown };
const show = (value: unknown) => (Array.isArray(value) ? value.join(", ") : String(value ?? "")) || "—";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const employee = await requireEmployee("ai.use");
  const notice = await searchParams;
  const allowed = (code: string) => (isPermissionCode(code) ? can(employee.permissions, code) : employee.permissions.includes(code));
  const header = <PageHeader trail={["Pilotage", "Assistant IA"]} title="Assistant IA" subtitle="L’assistant propose, vous confirmez : rien n’est modifié ni envoyé sans votre validation, et chaque décision est journalisée."/>;
  let data;
  try {
    const [status, pending, recent, products] = await Promise.all([
      adminApi<Status>("GET", "/admin/ai/status"),
      adminApiList<Proposal>("/admin/ai/proposals", { "filter[status]": "pending", "filter[kind]": "product_content", limit: 20 }),
      adminApiList<Proposal>("/admin/ai/proposals", { limit: 10, sort: "-createdAt" }),
      allowed("catalog.products.read") ? adminApiList<ProductListItem>("/admin/products", { limit: 100, sort: "-updatedAt" }) : Promise.resolve({ data: [] as ProductListItem[] }),
    ]);
    data = { status, pending: pending.data, recent: recent.data, products: products.data };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { status, pending, recent, products } = data;
  const productTitle = (id: string) => products.find((product) => product.id === id)?.title ?? id.slice(0, 8);

  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5 flex flex-wrap items-center gap-4 p-5 text-sm">
      <Bot size={20} className="text-slate-700"/>
      {status.available ? <Badge tone="orange">Disponible</Badge> : <Badge tone="warning">{status.configured ? "Désactivé dans les paramètres" : "Non configuré"}</Badge>}
      <span>Modèle : <b className="font-mono text-xs">{status.model}</b></span>
      <span>Aujourd’hui : <b>{status.quotas.usedToday} / {status.quotas.dailyRequestsPerEmployee}</b> demandes</span>
      <span>Ce mois : <b>{new Intl.NumberFormat("fr-FR").format(status.quotas.tokensThisMonth)}</b> / {new Intl.NumberFormat("fr-FR").format(status.quotas.monthlyTokenBudget)} jetons</span>
      {!status.configured && <p className="w-full text-xs text-amber-800">Ajoutez la variable <code>ANTHROPIC_API_KEY</code> au projet Vercel « mybigmarket » pour activer l’assistant.</p>}
    </Card>

    <div className="mb-5 grid gap-5 lg:grid-cols-2">
      {allowed("analytics.read") && <Card className="p-5"><h2 className="mb-3 font-bold text-slate-950">Résumé des ventes</h2><SalesSummaryTool/></Card>}
      <Card className="p-5"><h2 className="mb-3 font-bold text-slate-950">Recherche en langage naturel</h2><NaturalSearchTool/></Card>
    </div>

    {allowed("catalog.products.read") && <Card className="mb-5 p-5">
      <h2 className="mb-1 font-bold text-slate-950">Améliorer des fiches produits</h2>
      <p className="mb-4 text-sm text-slate-600">Une proposition par produit (20 au plus). Les fiches ne changent qu’après votre validation ci-dessous.</p>
      <form action={actions.bulkProposeAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Produits" hint="Ctrl/Cmd pour en choisir plusieurs." className="md:row-span-2"><select name="productIds" multiple required size={8} className="ui-input !h-auto">{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></Field>
        <Field label="Champs à améliorer" hint="Aucun : tous."><select name="fields" multiple size={6} className="ui-input !h-auto">{Object.entries(PRODUCT_FIELD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <div className="grid content-start gap-4">
          <Field label="Langue"><select name="language" className="ui-input"><option value="fr">Français</option><option value="en">Anglais</option></select></Field>
          <Field label="Consignes"><input name="instructions" maxLength={1000} placeholder="Ex. ton simple, insister sur la garantie" className="ui-input"/></Field>
          <button className="ui-button ui-button-primary">Générer les propositions</button>
        </div>
      </form>
    </Card>}

    <Card className="mb-5 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-bold text-slate-950">Propositions de fiches à valider ({pending.length})</h2>
        {pending.length > 1 && allowed("catalog.products.update") && <form action={actions.applyAllProposalsAction} className="ml-auto">{pending.map((proposal) => <input key={proposal.id} type="hidden" name="ids" value={proposal.id}/>)}<button className="ui-button ui-button-outline">Tout appliquer</button></form>}
      </div>
      {pending.length ? <div className="grid gap-4">{pending.map((proposal) => {
        const fields = (proposal.proposal.fields ?? {}) as Record<string, FieldChange>;
        const requested = (proposal.proposal.requestedFields as string[] | undefined) ?? Object.keys(fields);
        return <div key={proposal.id} className="rounded-lg border border-slate-200 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><Link href={`/catalogue/produits/${proposal.targetId}`} className="font-semibold hover:underline">{productTitle(proposal.targetId)}</Link><span className="text-xs text-slate-500">expire le {formatDate(proposal.expiresAt)}</span></div>
          {typeof proposal.proposal.rationale === "string" && <p className="mb-3 text-xs italic text-slate-600">{proposal.proposal.rationale}</p>}
          <form action={actions.applyProposalAction}>
            <input type="hidden" name="proposalId" value={proposal.id}/>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Appliquer</th><th>Champ</th><th>Actuel</th><th>Proposé</th></tr></thead><tbody>{Object.entries(fields).map(([field, change]) => <tr key={field}>
              <td><input type="checkbox" name="fields" value={field} defaultChecked={requested.includes(field)}/></td>
              <td className="text-xs font-semibold">{PRODUCT_FIELD_LABELS[field] ?? field}</td>
              <td className="max-w-xs whitespace-pre-line text-xs text-slate-500">{show(change.current)}</td>
              <td className="max-w-md whitespace-pre-line text-xs text-slate-900">{show(change.proposed)}</td>
            </tr>)}</tbody></table></div>
            {allowed("catalog.products.update") && <button className="ui-button ui-button-primary mt-3">Appliquer les champs cochés</button>}
          </form>
          <form action={actions.rejectProposalAction} className="mt-2"><input type="hidden" name="proposalId" value={proposal.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Refuser</button></form>
        </div>;
      })}</div> : <p className="text-sm text-slate-500">Aucune proposition en attente.</p>}
    </Card>

    <Card className="p-5">
      <h2 className="mb-3 font-bold text-slate-950">Dernières propositions</h2>
      {recent.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Date</th><th>Type</th><th>Cible</th><th>Statut</th></tr></thead><tbody>{recent.map((proposal) => <tr key={proposal.id}>
        <td className="text-xs">{formatDate(proposal.createdAt)}</td>
        <td className="text-sm">{PROPOSAL_KIND_LABELS[proposal.kind] ?? proposal.kind}</td>
        <td className="text-sm">{proposal.targetType === "product" ? <Link href={`/catalogue/produits/${proposal.targetId}`} className="hover:underline">{productTitle(proposal.targetId)}</Link> : <Link href={`/service-client/tickets/${proposal.targetId}`} className="hover:underline">Ticket</Link>}</td>
        <td><Badge tone={proposal.status === "applied" ? "orange" : proposal.status === "pending" ? "warning" : "neutral"}>{PROPOSAL_STATUS_LABELS[proposal.status] ?? proposal.status}</Badge></td>
      </tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Aucune proposition pour l’instant.</p>}
    </Card>
  </>;
}
