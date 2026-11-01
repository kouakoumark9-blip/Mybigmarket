import { asc } from "drizzle-orm";
import { Settings2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminSettings } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function displayValue(value: unknown) {
  try { return typeof value === "string" ? value : JSON.stringify(value); }
  catch { return "Valeur indisponible"; }
}

export default async function SettingsPage() {
  await requireEmployee("settings.read");
  const settings = await getAdminDb().select({ key: adminSettings.key, value: adminSettings.value, isSecret: adminSettings.isSecret, updatedAt: adminSettings.updatedAt }).from(adminSettings).orderBy(asc(adminSettings.key));

  return <>
    <div className="admin-breadcrumb"><span>Configuration</span><span>/</span><strong>Paramètres</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Paramètres</h1><p className="admin-page-subtitle">Configuration actuellement enregistrée pour la boutique et l’administration.</p></div></div>
    <Card className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50 p-4"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-800"/><div><h2 className="font-bold text-amber-950">Lecture seule pour cette étape</h2><p className="mt-1 text-sm leading-6 text-amber-900">Les paramètres sensibles, la devise et les règles financières ne sont pas modifiables sans validation dédiée. Les valeurs marquées secrètes ne sont jamais affichées.</p></div></Card>
    <Card>
      {settings.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[760px]"><thead><tr><th>Clé</th><th>Valeur</th><th>Mis à jour</th></tr></thead><tbody>{settings.map((setting) => <tr key={setting.key}><td className="font-mono text-xs font-semibold text-slate-800">{setting.key}</td><td className="max-w-xl break-words text-slate-700">{setting.isSecret ? <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Valeur masquée</span> : <code className="text-xs">{displayValue(setting.value) || "—"}</code>}</td><td className="whitespace-nowrap text-xs text-slate-500">{new Intl.DateTimeFormat("fr-CI", { dateStyle: "medium" }).format(setting.updatedAt)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><Settings2 size={22} className="mb-2 text-slate-400"/><strong>Aucun paramètre</strong>Les paramètres seedés apparaîtront ici après leur initialisation.</div>}
    </Card>
  </>;
}
