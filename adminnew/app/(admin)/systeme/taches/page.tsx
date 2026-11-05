import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";
type Task = { code: string; name: string; description: string; schedule: string; isEnabled: boolean; running: boolean; lastRunAt: string | null; lastStatus: string | null; lastDurationMs: number | null; lastError: string | null };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("system.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Configuration", "Tâches planifiées"]} title="Tâches planifiées" subtitle="Travaux exécutés automatiquement chaque nuit (expiration des paiements, statistiques, clôture des tickets, purge…). Vous pouvez en lancer une immédiatement ou la suspendre."/>;
  let tasks: Task[];
  try { tasks = await adminApi<Task[]>("GET", "/admin/tasks"); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card><div className="admin-table-wrap"><table className="admin-table min-w-[1000px]"><thead><tr><th>Tâche</th><th>Fréquence</th><th>Dernière exécution</th><th>État</th><th></th></tr></thead><tbody>{tasks.map((task) => <tr key={task.code}>
      <td><div className="font-semibold">{task.name}</div><div className="max-w-md text-xs text-slate-500">{task.description}</div><div className="font-mono text-[11px] text-slate-400">{task.code}</div></td>
      <td className="text-xs">{task.schedule}</td>
      <td className="text-xs">{task.lastRunAt ? <>{formatDate(task.lastRunAt)}{task.lastDurationMs != null && ` · ${task.lastDurationMs} ms`}{task.lastError && <div className="max-w-xs text-red-700">{task.lastError.slice(0, 160)}</div>}</> : "Jamais"}</td>
      <td><div className="flex flex-wrap gap-1">{task.isEnabled ? <Badge tone="orange">Active</Badge> : <Badge>Suspendue</Badge>}{task.running && <Badge tone="warning">En cours</Badge>}{task.lastStatus === "failed" && <Badge tone="danger">Dernier essai en échec</Badge>}</div></td>
      <td><div className="flex gap-3">
        <form action={actions.runTaskAction}><input type="hidden" name="code" value={task.code}/><button className="text-xs font-semibold hover:underline" disabled={task.running}>Lancer maintenant</button></form>
        <form action={actions.toggleTaskAction}><input type="hidden" name="code" value={task.code}/><input type="hidden" name="isEnabled" value={String(task.isEnabled)}/><button className="text-xs font-semibold hover:underline">{task.isEnabled ? "Suspendre" : "Réactiver"}</button></form>
      </div></td>
    </tr>)}</tbody></table></div></Card>
  </>;
}
