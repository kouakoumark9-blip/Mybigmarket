import { asc, isNull } from "drizzle-orm";
import { Globe2, Plus, Star, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminShippingZones } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { saveZoneAction, setDefaultZoneAction, toggleZoneAction, trashZoneAction } from "../actions";

export const dynamic = "force-dynamic";

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Zone enregistrée." },
  "duplicate-code": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Ce code de zone est déjà utilisé." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : le code doit être en majuscules, sans espace." },
  "needs-country": { tone: "border-red-200 bg-red-50 text-red-800", text: "Renseigne au moins un pays : une zone sans pays ne peut jamais être résolue." },
  toggled: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Statut de la zone mis à jour." },
  default: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Zone par défaut mise à jour. Elle sert de repli quand aucun pays ne correspond." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Zone introuvable ou déjà dans la corbeille." },
  trashed: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Zone déplacée dans la corbeille. Ses tranches ne sont plus proposées." },
};

export default async function ZonesPage({ searchParams }: { searchParams: Promise<{ notice?: string; edit?: string }> }) {
  await requireEmployee("shipping.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const zones = await getAdminDb().select().from(adminShippingZones)
    .where(isNull(adminShippingZones.deletedAt))
    .orderBy(asc(adminShippingZones.sortOrder), asc(adminShippingZones.name));
  const editing = params.edit ? zones.find((zone) => zone.id === params.edit) : undefined;
  const defaults = zones.filter((zone) => zone.isDefault).length;

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><span>Transport</span><span>/</span><strong>Zones</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Zones de livraison</h1><p className="admin-page-subtitle">La zone détermine la grille appliquée. Résolution : ville, puis région, puis pays, puis zone par défaut.</p></div>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}
    {defaults > 1 && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">Plusieurs zones par défaut sont marquées : la résolution deviendrait ambiguë. Désigne-en une seule.</p>}

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><Plus size={19}/></div>
        <div><h2 className="font-bold text-slate-950">{editing ? "Modifier la zone" : "Nouvelle zone"}</h2><p className="text-xs text-slate-500">Pays obligatoire. Régions et villes affinent la résolution à l&apos;intérieur d&apos;un pays.</p></div>
      </div>
      <form action={saveZoneAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Code<input name="code" required defaultValue={editing?.code} pattern="[A-Z0-9_]{2,40}" maxLength={40} className="ui-input" placeholder="CI_ABIDJAN"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom<input name="name" required defaultValue={editing?.name} minLength={2} maxLength={120} className="ui-input" placeholder="Abidjan"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Ordre<input name="sortOrder" type="number" min={0} max={9999} defaultValue={editing?.sortOrder ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">Pays (codes ISO, séparés par des virgules)<input name="countryCodes" required defaultValue={editing?.countryCodes.join(", ")} maxLength={400} className="ui-input" placeholder="CI"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">Régions (facultatif)<input name="regionCodes" defaultValue={editing?.regionCodes.join(", ")} maxLength={600} className="ui-input" placeholder="ABIDJAN, BOUAKE"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">Villes (facultatif)<input name="cityNames" defaultValue={editing?.cityNames.join(", ")} maxLength={600} className="ui-input" placeholder="Abidjan, Bingerville"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3">Note interne<input name="notes" defaultValue={editing?.notes} maxLength={500} className="ui-input" placeholder="Conditions particulières, accord transporteur…"/></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{editing ? "Enregistrer" : "Créer la zone"}</button>
          {editing && <a href="/transport/zones" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Zones enregistrées</h2><p className="text-xs text-slate-500">{zones.filter((zone) => zone.isActive).length} active(s) sur {zones.length}</p></div>
      {zones.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[980px]">
        <thead><tr><th>Zone</th><th>Pays</th><th>Régions / villes</th><th>Ordre</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{zones.map((zone) => <tr key={zone.id}>
          <td><div className="flex items-center gap-2"><Globe2 size={16} className="text-slate-400"/><div><div className="font-semibold text-slate-900">{zone.name}{zone.isDefault && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800"><Star size={10}/>Défaut</span>}</div><div className="text-[11px] text-slate-500">{zone.code}</div></div></div></td>
          <td className="text-xs">{zone.countryCodes.join(", ") || "—"}</td>
          <td className="text-xs">{[...zone.regionCodes, ...zone.cityNames].join(", ") || "Tout le pays"}</td>
          <td>{zone.sortOrder}</td>
          <td><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${zone.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{zone.isActive ? "Active" : "Inactive"}</span></td>
          <td><div className="flex justify-end gap-2">
            <a href={`/transport/zones?edit=${zone.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
            {!zone.isDefault && <form action={setDefaultZoneAction}><input type="hidden" name="id" value={zone.id}/><button type="submit" className="text-xs font-semibold text-blue-700 hover:underline">Par défaut</button></form>}
            <form action={toggleZoneAction}><input type="hidden" name="id" value={zone.id}/><button type="submit" className="text-xs font-semibold text-slate-700 hover:underline">{zone.isActive ? "Désactiver" : "Activer"}</button></form>
            <form action={trashZoneAction}><input type="hidden" name="id" value={zone.id}/><button type="submit" className="text-xs font-semibold text-red-700 hover:underline">Corbeille</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><strong>Aucune zone</strong>Crée une zone pour pouvoir saisir des tarifs.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Une zone supprimée reste en base (corbeille) pour ne pas casser l&apos;historique des commandes passées. Les commandes déjà expédiées conservent leur zone d&apos;origine.</span></div>
    </Card>
  </>;
}
