import Link from "next/link";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type Form = { id: number; code: string; title: string; isActive: boolean; submissions: number; unread: number };
type Submission = { id: number; data: Record<string, unknown>; email: string | null; status: string; createdAt: string };

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; form?: string }> }) {
  await requireEmployee("appearance.read");
  const params = await searchParams;
  const header = <PageHeader trail={["Boutique", "Formulaires"]} title="Formulaires et réponses" subtitle="Réponses reçues par les formulaires du site. Les messages du formulaire de contact deviennent aussi des tickets du service client."/>;
  let data;
  try {
    const forms = await adminApi<Form[]>("GET", "/admin/forms");
    const selected = forms.find((form) => form.code === params.form) ?? forms[0];
    const submissions = selected ? await adminApiList<Submission>(`/admin/forms/${selected.code}/submissions`, { limit: 50 }) : null;
    data = { forms, selected, submissions };
  } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  const { forms, selected, submissions } = data;
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <div className="mb-4 flex flex-wrap gap-2">{forms.map((form) => <Link key={form.code} href={`/contenu/formulaires?form=${form.code}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected?.code === form.code ? "border-orange-500 bg-orange-50 text-orange-900" : "border-slate-200 text-slate-700"}`}>{form.title} <span className="text-slate-500">{form.submissions}</span>{form.unread > 0 && <span className="ml-1 text-orange-700">· {form.unread} nouvelle(s)</span>}</Link>)}</div>
    <Card>
      {submissions?.data.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Reçue</th><th>E-mail</th><th>Contenu</th><th>Statut</th></tr></thead><tbody>{submissions.data.map((submission) => <tr key={submission.id}>
        <td className="text-xs">{formatDate(submission.createdAt)}</td>
        <td className="text-sm">{submission.email ?? "—"}</td>
        <td className="max-w-xl text-xs leading-5">{Object.entries(submission.data).map(([key, value]) => <div key={key}><b>{key}</b> : {String(value).slice(0, 400)}</div>)}</td>
        <td>{submission.status === "new" ? <Badge tone="orange">Nouvelle</Badge> : <Badge>{submission.status === "read" ? "Lue" : "Archivée"}</Badge>}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Inbox size={22} className="mb-2 text-slate-400"/><strong>Aucune réponse</strong>{forms.length ? "Ce formulaire n’a encore rien reçu." : "Aucun formulaire configuré."}</div>}
    </Card>
  </>;
}
