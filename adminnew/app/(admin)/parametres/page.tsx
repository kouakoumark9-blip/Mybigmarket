import { asc } from "drizzle-orm";
import { Settings2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminSettings } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { can, isPermissionCode } from "@/lib/permission-matrix";
import { Field, Notice } from "@/components/admin/page";
import { updateStoreContactAction } from "./actions";

export const dynamic = "force-dynamic";

function displayValue(value: unknown) {
  try { return typeof value === "string" ? value : JSON.stringify(value); }
  catch { return "Valeur indisponible"; }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const employee = await requireEmployee("settings.read");
  const notice = await searchParams;
  const canUpdate = isPermissionCode("settings.update") ? can(employee.permissions, "settings.update") : employee.permissions.includes("settings.update");
  const settings = await getAdminDb().select({ key: adminSettings.key, value: adminSettings.value, isSecret: adminSettings.isSecret, updatedAt: adminSettings.updatedAt }).from(adminSettings).orderBy(asc(adminSettings.key));
  const current = (key: string) => { const value = settings.find((setting) => setting.key === key)?.value; return typeof value === "string" ? value : ""; };

  return <>
    <div className="admin-breadcrumb"><span>Configuration</span><span>/</span><strong>Paramètres</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Paramètres</h1><p className="admin-page-subtitle">Configuration actuellement enregistrée pour la boutique et l’administration.</p></div></div>
    <Card className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50 p-4"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-800"/><div><h2 className="font-bold text-amber-950">Lecture seule pour cette étape</h2><p className="mt-1 text-sm leading-6 text-amber-900">Les paramètres sensibles, la devise et les règles financières ne sont pas modifiables sans validation dédiée. Les valeurs marquées secrètes ne sont jamais affichées.</p></div></Card>
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5 p-5">
      <h2 className="mb-1 font-bold text-slate-950">Coordonnées de la boutique</h2>
      <p className="mb-4 text-sm text-slate-600">Affichées sur le site. Le bouton WhatsApp n’apparaît qu’une fois le numéro renseigné.</p>
      <form action={updateStoreContactAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Numéro WhatsApp" hint="Format international, ex. +225 07 00 00 00 00"><input name="whatsapp" defaultValue={current("store.whatsapp")} maxLength={24} placeholder="+225 07 00 00 00 00" className="ui-input" disabled={!canUpdate}/></Field>
        <Field label="Téléphone"><input name="phone" defaultValue={current("store.phone")} maxLength={32} className="ui-input" disabled={!canUpdate}/></Field>
        <Field label="E-mail de contact"><input name="email" type="email" defaultValue={current("store.email")} maxLength={190} className="ui-input" disabled={!canUpdate}/></Field>
        {canUpdate && <div><button className="ui-button ui-button-primary">Enregistrer</button></div>}
      </form>
    </Card>
    <Card>
      {settings.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[760px]"><thead><tr><th>Clé</th><th>Valeur</th><th>Mis à jour</th></tr></thead><tbody>{settings.map((setting) => <tr key={setting.key}><td className="font-mono text-xs font-semibold text-slate-800">{setting.key}</td><td className="max-w-xl break-words text-slate-700">{setting.isSecret ? <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">Valeur masquée</span> : <code className="text-xs">{displayValue(setting.value) || "—"}</code>}</td><td className="whitespace-nowrap text-xs text-slate-500">{new Intl.DateTimeFormat("fr-CI", { dateStyle: "medium" }).format(setting.updatedAt)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><Settings2 size={22} className="mb-2 text-slate-400"/><strong>Aucun paramètre</strong>Les paramètres seedés apparaîtront ici après leur initialisation.</div>}
    </Card>
  </>;
}
