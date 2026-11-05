import { FileUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
type Job = { id: string; entity: string; status: string; fileName: string | null; totalRows: number; planned: Record<string, number> | null; warnings: string[]; progress: { processed: number; created: number; updated: number; skipped: number; errors: number; percent: number }; createdAt: string; finishedAt: string | null };
const ENTITIES: Record<string, string> = { products: "Produits", categories: "Catégories", brands: "Marques" };
const STATUS: Record<string, [string, "orange" | "warning" | "danger" | "neutral"]> = { analyzing: ["Analyse", "warning"], simulated: ["Simulation prête", "warning"], running: ["En cours", "warning"], completed: ["Terminé", "orange"], failed: ["Échec", "danger"], cancelled: ["Annulé", "neutral"] };

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("catalog.import");
  const notice = await searchParams;
  const header = <PageHeader trail={["Outils", "Imports"]} title="Imports CSV" subtitle="Chaque fichier est d’abord simulé ligne par ligne, sans rien écrire. Vous lancez ensuite l’import, traité par lots en arrière-plan ; les lignes en erreur sont écartées et listées dans le rapport."/>;
  let jobs;
  try { jobs = await adminApiList<Job>("/admin/imports", { limit: 20, sort: "-createdAt" }); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5 p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouveau fichier</h2>
      <form action={actions.analyzeImportAction} className="grid gap-4 md:grid-cols-[200px_1fr_auto]">
        <Field label="Type de données"><select name="entity" className="ui-input">{Object.entries(ENTITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Fichier CSV (4 Mo au plus)"><input name="file" type="file" accept=".csv,text/csv" required className="ui-input py-1.5"/></Field>
        <div className="flex items-end"><button className="ui-button ui-button-primary">Simuler l’import</button></div>
      </form>
      <p className="mt-3 text-xs text-slate-600">Modèles : {Object.entries(ENTITIES).map(([value, label]) => <a key={value} href={`/outils/telecharger?chemin=/admin/imports/templates/${value}`} className="mr-3 font-semibold underline">{label}</a>)}</p>
    </Card>
    <Card>
      {jobs.data.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1000px]"><thead><tr><th>Fichier</th><th>Statut</th><th>Lignes</th><th>Résultat</th><th>Actions</th></tr></thead><tbody>{jobs.data.map((job) => <tr key={job.id}>
        <td><div className="font-semibold">{job.fileName ?? "—"}</div><div className="text-[11px] text-slate-500">{ENTITIES[job.entity] ?? job.entity} · {formatDate(job.createdAt)}</div></td>
        <td><Badge tone={STATUS[job.status]?.[1] ?? "neutral"}>{STATUS[job.status]?.[0] ?? job.status}</Badge>{job.status === "running" && <div className="mt-1 text-[11px] text-slate-500">{job.progress.percent} %</div>}</td>
        <td className="text-sm">{job.totalRows}</td>
        <td className="text-xs leading-5">{job.status === "simulated" && job.planned ? Object.entries(job.planned).map(([key, value]) => <div key={key}>{key === "create" ? "à créer" : key === "update" ? "à modifier" : key === "error" ? "en erreur" : key === "skip" ? "ignorées" : key} : <b>{value}</b></div>)
          : <div>{job.progress.created} créé(s) · {job.progress.updated} modifié(s) · {job.progress.errors} erreur(s)</div>}
          {job.warnings.length > 0 && <div className="text-amber-800">{job.warnings.slice(0, 2).join(" · ")}</div>}</td>
        <td><div className="flex flex-wrap gap-3">
          {job.status === "simulated" && <form action={actions.runImportAction}><input type="hidden" name="jobId" value={job.id}/><button className="ui-button ui-button-primary h-8 text-xs">Lancer l’import</button></form>}
          {job.status === "running" && <form action={actions.continueImportAction}><input type="hidden" name="jobId" value={job.id}/><button className="text-xs font-semibold hover:underline">Traiter le lot suivant</button></form>}
          {["simulated", "running"].includes(job.status) && <form action={actions.cancelImportAction}><input type="hidden" name="jobId" value={job.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Annuler</button></form>}
          <a href={`/outils/telecharger?chemin=/admin/imports/${job.id}/report.csv`} className="text-xs font-semibold underline">Rapport</a>
        </div></td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><FileUp size={22} className="mb-2 text-slate-400"/><strong>Aucun import</strong>Déposez un fichier ci-dessus.</div>}
    </Card>
  </>;
}
