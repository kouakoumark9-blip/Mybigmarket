import { asc, eq, isNull } from "drizzle-orm";
import { Plus, Scale, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminShippingMethods, adminShippingRates, adminShippingZones } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { saveRateAction, trashRateAction } from "../actions";

export const dynamic = "force-dynamic";

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Tranche enregistrée et marquée comme tarif réel." },
  overlap: { tone: "border-red-200 bg-red-50 text-red-800", text: "Refusé : cette tranche chevauche une tranche existante du même transporteur et de la même zone. Deux tarifs concurrents ne doivent jamais coexister." },
  "bad-range": { tone: "border-red-200 bg-red-50 text-red-800", text: "La borne maximale doit être supérieure ou égale à la borne minimale." },
  "bad-transit": { tone: "border-red-200 bg-red-50 text-red-800", text: "Le délai maximum de la tranche doit être supérieur ou égal au délai minimum." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : vérifie la méthode, la zone et les montants." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Tranche introuvable ou déjà dans la corbeille." },
  trashed: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Tranche déplacée dans la corbeille : elle n'est plus utilisée par les devis." },
};

const unitLabel = (mode: string) => (mode === "sea" ? "m³" : "kg");

export default async function RatesPage({ searchParams }: { searchParams: Promise<{ notice?: string; edit?: string }> }) {
  await requireEmployee("shipping.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const [methods, zones, rates] = await Promise.all([
    db.select().from(adminShippingMethods).where(isNull(adminShippingMethods.deletedAt)).orderBy(asc(adminShippingMethods.name)),
    db.select().from(adminShippingZones).where(isNull(adminShippingZones.deletedAt)).orderBy(asc(adminShippingZones.sortOrder)),
    db.select({
      id: adminShippingRates.id,
      methodId: adminShippingRates.shippingMethodId,
      zoneId: adminShippingRates.shippingZoneId,
      methodName: adminShippingMethods.name,
      mode: adminShippingMethods.mode,
      zoneName: adminShippingZones.name,
      minimum: adminShippingRates.minimumBillableUnits,
      maximum: adminShippingRates.maximumBillableUnits,
      rate: adminShippingRates.rateXofPerUnit,
      minimumCharge: adminShippingRates.minimumChargeXof,
      handling: adminShippingRates.handlingFeeXof,
      customs: adminShippingRates.customsFeeXof,
      label: adminShippingRates.label,
      transitMin: adminShippingRates.transitDaysMin,
      transitMax: adminShippingRates.transitDaysMax,
      sampleOnly: adminShippingRates.sampleOnly,
    })
      .from(adminShippingRates)
      .innerJoin(adminShippingMethods, eq(adminShippingRates.shippingMethodId, adminShippingMethods.id))
      .innerJoin(adminShippingZones, eq(adminShippingRates.shippingZoneId, adminShippingZones.id))
      .where(isNull(adminShippingRates.deletedAt))
      .orderBy(asc(adminShippingZones.sortOrder), asc(adminShippingMethods.name), asc(adminShippingRates.minimumBillableUnits))
      .limit(200),
  ]);
  const editing = params.edit ? rates.find((rate) => rate.id === params.edit) : undefined;
  const samples = rates.filter((rate) => rate.sampleOnly).length;

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><span>Transport</span><span>/</span><strong>Tarifs</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Tranches tarifaires</h1><p className="admin-page-subtitle">Chaque tranche couvre une plage d&apos;unités facturables (kg en aérien, m³ en maritime). Une saisie manuelle vaut tarif réel.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{rates.length} tranche(s)</span>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}
    {samples > 0 && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"><TriangleAlert size={14} className="mr-1 inline"/> {samples} tranche(s) proviennent encore du jeu d&apos;exemple et ne permettent pas d&apos;activer un transporteur. Ressaisis-les avec les tarifs confirmés.</p>}

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><Plus size={19}/></div>
        <div><h2 className="font-bold text-slate-950">{editing ? "Modifier la tranche" : "Nouvelle tranche"}</h2><p className="text-xs text-slate-500">Laisse la borne maximale vide pour la dernière tranche (jusqu&apos;à l&apos;infini).</p></div>
      </div>
      <form action={saveRateAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Transporteur<select name="methodId" required defaultValue={editing?.methodId} className="ui-input">{methods.map((method) => <option key={method.id} value={method.id}>{method.name} ({method.mode === "air" ? "aérien" : "maritime"})</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Zone<select name="zoneId" required defaultValue={editing?.zoneId} className="ui-input">{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Borne minimale<input name="minimumBillableUnits" type="number" step="0.0001" min={0} required defaultValue={editing?.minimum ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Borne maximale (vide = ∞)<input name="maximumBillableUnits" type="number" step="0.0001" min={0} defaultValue={editing?.maximum ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Tarif par unité<input name="rateXofPerUnit" type="number" min={0} required defaultValue={editing?.rate ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Frais minimum<input name="minimumChargeXof" type="number" min={0} defaultValue={editing?.minimumCharge ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Frais d&apos;approche<input name="handlingFeeXof" type="number" min={0} defaultValue={editing?.handling ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Douane de la tranche<input name="customsFeeXof" type="number" min={0} defaultValue={editing?.customs ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Délai mini (jours)<input name="transitDaysMin" type="number" min={0} max={365} defaultValue={editing?.transitMin ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Délai maxi (jours)<input name="transitDaysMax" type="number" min={0} max={365} defaultValue={editing?.transitMax ?? ""} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Libellé<input name="label" maxLength={120} defaultValue={editing?.label} className="ui-input" placeholder="0 à 5 kg"/></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit" disabled={!methods.length || !zones.length}>{editing ? "Enregistrer" : "Ajouter la tranche"}</button>
          {editing && <a href="/transport/tarifs" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
          {(!methods.length || !zones.length) && <span className="text-xs text-amber-700">Crée d&apos;abord un transporteur et une zone.</span>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      {rates.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1050px]">
        <thead><tr><th>Transporteur</th><th>Zone</th><th>Tranche</th><th>Tarif / unité</th><th>Frais</th><th>Délai</th><th>Nature</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{rates.map((rate) => <tr key={rate.id}>
          <td><div className="font-semibold text-slate-900">{rate.methodName}</div><div className="text-[11px] text-slate-500">{rate.mode === "air" ? "Aérien" : "Maritime"}</div></td>
          <td>{rate.zoneName}</td>
          <td className="whitespace-nowrap">{rate.label || `${Number(rate.minimum)} – ${rate.maximum ? Number(rate.maximum) : "∞"} ${unitLabel(rate.mode)}`}</td>
          <td className="whitespace-nowrap font-semibold">{money(rate.rate)}</td>
          <td className="text-xs">approche {money(rate.handling)}<br/>douane {money(rate.customs)}<br/>min. {money(rate.minimumCharge)}</td>
          <td className="whitespace-nowrap text-xs">{rate.transitMin ?? "—"}–{rate.transitMax ?? "—"} j</td>
          <td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rate.sampleOnly ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{rate.sampleOnly ? "Exemple" : "Réelle"}</span></td>
          <td><div className="flex justify-end gap-2">
            <a href={`/transport/tarifs?edit=${rate.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
            <form action={trashRateAction}><input type="hidden" name="id" value={rate.id}/><button type="submit" className="text-xs font-semibold text-red-700 hover:underline">Corbeille</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Scale size={24} className="mb-2 text-slate-400"/><strong>Aucune tranche</strong>Ajoute des tranches pour qu&apos;un transporteur puisse chiffrer un envoi.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Le moteur applique la tranche dont la plage contient l&apos;unité facturable. Si aucune ne correspond, le transporteur est retiré du devis ou la dernière tranche s&apos;applique, selon le réglage « hors barème » du transporteur.</span></div>
    </Card>
  </>;
}
