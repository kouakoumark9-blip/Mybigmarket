import { MessageSquareQuote } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { TICKET_CATEGORY_LABELS, type ReplyTemplate } from "@/lib/support-labels";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

const VARIABLES = ["{{customerName}}", "{{ticketReference}}", "{{ticketSubject}}", "{{orderReference}}", "{{agentName}}", "{{storeName}}"];

export default async function ReplyTemplatesPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("support.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Relations clients", "Modèles de réponse"]} title="Modèles de réponse" subtitle={`Réponses types insérées depuis un ticket, puis relues avant envoi. Variables : ${VARIABLES.join(" ")}.`}/>;
  let templates: ReplyTemplate[];
  try {
    templates = await adminApi<ReplyTemplate[]>("GET", "/admin/support/templates");
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const categoryOptions = <><option value="">Toutes catégories</option>{Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>;
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="mb-5 grid gap-4">
      {templates.length ? templates.map((template) => <Card key={template.id} className="p-5">
        <form action={actions.updateTemplateAction} className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input type="hidden" name="templateId" value={template.id}/>
          <Field label="Titre"><input name="title" defaultValue={template.title} required minLength={2} maxLength={160} className="ui-input"/></Field>
          <Field label="Catégorie"><select name="category" defaultValue={template.category ?? ""} className="ui-input">{categoryOptions}</select></Field>
          <Field label="Texte" className="md:col-span-2"><textarea name="body" defaultValue={template.body} required minLength={2} rows={5} className="ui-input !h-auto py-2"/></Field>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <span className="font-mono text-[11px] text-slate-500">{template.code}</span>
            {template.isActive ? <Badge tone="orange">Actif</Badge> : <Badge>Inactif</Badge>}
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="isActive" defaultChecked={template.isActive}/> Proposé dans les tickets</label>
            <button className="ui-button ui-button-outline ml-auto">Enregistrer</button>
          </div>
        </form>
        <form action={actions.deleteTemplateAction} className="mt-2 text-right"><input type="hidden" name="templateId" value={template.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
      </Card>) : <Card><div className="admin-empty"><MessageSquareQuote size={22} className="mb-2 text-slate-400"/><strong>Aucun modèle</strong>Créez votre premier modèle ci-dessous.</div></Card>}
    </div>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouveau modèle</h2>
      <form action={actions.createTemplateAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Titre"><input name="title" required minLength={2} maxLength={160} className="ui-input"/></Field>
        <Field label="Code" hint="Vide : déduit du titre."><input name="code" maxLength={60} className="ui-input"/></Field>
        <Field label="Catégorie"><select name="category" className="ui-input">{categoryOptions}</select></Field>
        <Field label="Texte" className="md:col-span-3"><textarea name="body" required minLength={2} rows={5} placeholder="Bonjour {{customerName}}, …" className="ui-input !h-auto py-2"/></Field>
        <div className="md:col-span-3"><button className="ui-button ui-button-primary">Créer le modèle</button></div>
      </form>
    </Card>
  </>;
}
