import Link from "next/link";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
type TemplateSummary = { code: string; name: string; audience: string; source: string; subject: string; variables: string[] };
type Template = { code: string; subject: string; bodyHtml: string; bodyText?: string | null; variables?: string[] };
type QueuedEmail = { id: number; toAddress: string; templateCode: string | null; subject: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null };
const STATUS: Record<string, [string, "orange" | "warning" | "danger" | "neutral"]> = { pending: ["En file", "warning"], sending: ["Envoi", "warning"], sent: ["Envoyé", "orange"], failed: ["Échec", "danger"] };

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; modele?: string }> }) {
  await requireEmployee("communication.read");
  const params = await searchParams;
  const header = <PageHeader trail={["Boutique", "E-mails"]} title="E-mails transactionnels" subtitle="Modèles envoyés automatiquement (commande, paiement, expédition, service client…) et file d’envoi avec nouvel essai en cas d’échec." actions={<form action={actions.processQueueAction}><button className="ui-button ui-button-outline">Traiter la file maintenant</button></form>}/>;
  let data;
  try {
    const [templates, queue] = await Promise.all([adminApi<TemplateSummary[]>("GET", "/admin/email-templates"), adminApiList<QueuedEmail>("/admin/emails", { limit: 30 })]);
    const code = params.modele ?? templates[0]?.code;
    const selected = code ? await adminApi<Template>("GET", `/admin/email-templates/${code}`) : null;
    data = { templates, queue, selected, code };
  } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  const { templates, queue, selected, code } = data;
  const summary = templates.find((template) => template.code === code);
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <div className="mb-5 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="p-3"><ul className="grid gap-1">{templates.map((template) => <li key={template.code}><Link href={`/communication/emails?modele=${template.code}`} className={`block rounded-md px-3 py-2 text-sm ${template.code === code ? "bg-orange-50 font-semibold text-orange-900" : "hover:bg-slate-50"}`}>{template.name}<span className="block text-[11px] text-slate-500">{template.source === "database" ? "personnalisé" : "modèle d’origine"} · {template.audience === "customer" ? "client" : "équipe"}</span></Link></li>)}</ul></Card>
      {selected && summary ? <Card className="p-5">
        <form action={actions.saveTemplateAction} className="grid gap-4">
          <input type="hidden" name="code" value={selected.code}/>
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-950">{summary.name}</h2>{summary.source === "database" ? <Badge tone="orange">Personnalisé</Badge> : <Badge>Modèle d’origine</Badge>}</div>
          {summary.variables.length > 0 && <p className="text-xs text-slate-600">Variables : {summary.variables.map((variable) => <code key={variable} className="mr-1 rounded bg-slate-100 px-1">{`{{${variable}}}`}</code>)}</p>}
          <Field label="Objet"><input name="subject" defaultValue={selected.subject} required minLength={2} maxLength={240} className="ui-input"/></Field>
          <Field label="Contenu HTML" hint="Les variables sont échappées à l’envoi."><textarea name="bodyHtml" defaultValue={selected.bodyHtml} required rows={14} className="ui-input !h-auto py-2 font-mono text-xs"/></Field>
          <Field label="Version texte (facultative)"><textarea name="bodyText" defaultValue={selected.bodyText ?? ""} rows={5} className="ui-input !h-auto py-2 font-mono text-xs"/></Field>
          <div className="flex flex-wrap gap-3"><button className="ui-button ui-button-primary">Enregistrer et activer</button></div>
        </form>
        {summary.source === "database" && <form action={actions.revertTemplateAction} className="mt-3"><input type="hidden" name="code" value={selected.code}/><button className="text-xs font-semibold text-red-700 hover:underline">Rétablir le modèle d’origine</button></form>}
      </Card> : <Card className="p-5 text-sm text-slate-500">Aucun modèle.</Card>}
    </div>
    <Card className="mb-5 p-5">
      <h2 className="mb-3 font-bold text-slate-950">Tester l’envoi</h2>
      <form action={actions.sendTestAction} className="flex flex-wrap gap-3"><input name="to" type="email" required placeholder="adresse@exemple.ci" className="ui-input w-72"/><button className="ui-button ui-button-outline">Envoyer un e-mail de test</button></form>
      <p className="mt-2 text-xs text-slate-500">Sans configuration SMTP sur Vercel, les e-mails restent en file d’attente.</p>
    </Card>
    <Card id="file">
      <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-950">File d’envoi</div>
      {queue.data.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[900px]"><thead><tr><th>Créé</th><th>Destinataire</th><th>Objet</th><th>Statut</th><th>Essais</th><th></th></tr></thead><tbody>{queue.data.map((email) => <tr key={email.id}>
        <td className="text-xs">{formatDate(email.createdAt)}</td>
        <td className="text-sm">{email.toAddress}</td>
        <td className="max-w-xs text-sm">{email.subject}<div className="font-mono text-[11px] text-slate-500">{email.templateCode}</div>{email.lastError && <div className="text-[11px] text-red-700">{email.lastError.slice(0, 160)}</div>}</td>
        <td><Badge tone={STATUS[email.status]?.[1] ?? "neutral"}>{STATUS[email.status]?.[0] ?? email.status}</Badge></td>
        <td className="text-xs">{email.attempts}</td>
        <td>{email.status === "failed" && <form action={actions.retryEmailAction}><input type="hidden" name="emailId" value={email.id}/><button className="text-xs font-semibold hover:underline">Réessayer</button></form>}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Mail size={22} className="mb-2 text-slate-400"/><strong>File vide</strong></div>}
    </Card>
  </>;
}
