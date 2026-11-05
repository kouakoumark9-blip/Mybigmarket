import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";
import { resolveErrorGroupAction } from "./actions";

export const dynamic = "force-dynamic";
type Group = { fingerprint: string; source: string; code: string | null; route: string | null; message: string; occurrences: number; open: number; firstSeen: string; lastSeen: string };

export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; tout?: string }> }) {
  await requireEmployee("logs.read");
  const params = await searchParams;
  const open = params.tout !== "1";
  const header = <PageHeader trail={["Configuration", "Journal d’erreurs"]} title="Journal d’erreurs" subtitle="Erreurs du serveur regroupées par cause (API, tâches, événements). Les données personnelles sont masquées. Marquez une erreur comme résolue une fois corrigée."/>;
  let groups: Group[];
  try { groups = await adminApi<Group[]>("GET", "/admin/error-logs/groups", { query: { open: open || undefined, limit: 100 } }); } catch (error) { return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>; }
  return <>
    {header}
    <Notice ok={params.ok} error={params.error}/>
    <div className="mb-4 flex gap-2"><Link href="/systeme/erreurs" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${open ? "border-orange-500 bg-orange-50" : "border-slate-200"}`}>À traiter</Link><Link href="/systeme/erreurs?tout=1" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!open ? "border-orange-500 bg-orange-50" : "border-slate-200"}`}>Toutes</Link></div>
    <Card>
      {groups.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1000px]"><thead><tr><th>Erreur</th><th>Origine</th><th>Occurrences</th><th>Vue</th><th></th></tr></thead><tbody>{groups.map((group) => <tr key={group.fingerprint}>
        <td className="max-w-xl"><div className="text-sm font-semibold text-slate-900">{group.message.slice(0, 240)}</div>{group.code && <div className="font-mono text-[11px] text-slate-500">{group.code}</div>}</td>
        <td className="text-xs">{group.source}{group.route && <div className="font-mono text-[11px] text-slate-500">{group.route}</div>}</td>
        <td><b>{group.occurrences}</b>{group.open > 0 && <Badge tone="danger">{group.open} ouverte(s)</Badge>}</td>
        <td className="text-xs">{formatDate(group.firstSeen)}<br/>→ {formatDate(group.lastSeen)}</td>
        <td>{group.open > 0 && <form action={resolveErrorGroupAction}><input type="hidden" name="fingerprint" value={group.fingerprint}/><button className="text-xs font-semibold hover:underline">Marquer résolue</button></form>}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><ShieldCheck size={22} className="mb-2 text-slate-400"/><strong>Aucune erreur {open ? "à traiter" : "enregistrée"}</strong></div>}
    </Card>
  </>;
}
