import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Plane, Plus, Ship, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminShippingMethods, adminShippingRates } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { saveMethodAction, toggleMethodAction, trashMethodAction } from "../actions";

export const dynamic = "force-dynamic";

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Transporteur enregistré. Il reste désactivé jusqu’à activation explicite." },
  "duplicate-code": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Ce code de transporteur est déjà utilisé." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : vérifie le code, les seuils et les délais." },
  "transit-order": { tone: "border-red-200 bg-red-50 text-red-800", text: "Le délai maximum doit être supérieur ou égal au délai minimum." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Transporteur introuvable ou déjà dans la corbeille." },
  enabled: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Transporteur activé : ses tarifs réels sont désormais proposés aux clients." },
  disabled: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Transporteur désactivé : il n’apparaît plus dans les devis." },
  trashed: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Transporteur déplacé dans la corbeille." },
  "needs-rates": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Activation refusée : ajoute au moins une tranche tarifaire réelle." },
  "needs-real-rates": { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Activation refusée : la grille ne contient que des tarifs d’exemple. Saisis les tarifs validés par le transporteur." },
};

export default async function MethodsPage({ searchParams }: { searchParams: Promise<{ notice?: string; edit?: string }> }) {
  await requireEmployee("shipping.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const methods = await db.select().from(adminShippingMethods)
    .where(isNull(adminShippingMethods.deletedAt))
    .orderBy(asc(adminShippingMethods.mode), asc(adminShippingMethods.name));
  const states = await db.select({
    methodId: adminShippingRates.shippingMethodId,
    real: sql<number>`count(*) filter (where ${adminShippingRates.sampleOnly} = false)`,
    sample: sql<number>`count(*) filter (where ${adminShippingRates.sampleOnly} = true)`,
  }).from(adminShippingRates)
    .where(and(isNull(adminShippingRates.deletedAt), eq(adminShippingRates.isActive, true)))
    .groupBy(adminShippingRates.shippingMethodId);
  const stateByMethod = new Map(states.map((row) => [row.methodId, { real: Number(row.real), sample: Number(row.sample) }]));
  const editing = params.edit ? methods.find((method) => method.id === params.edit) : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><span>Transport</span><span>/</span><strong>Transporteurs</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Transporteurs</h1><p className="admin-page-subtitle">Un transporteur n’est proposé aux clients que s’il est actif et adossé à des tarifs réels. Les grilles d’exemple ne peuvent pas être facturées.</p></div>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><Plus size={19}/></div>
        <div><h2 className="font-bold text-slate-950">{editing ? "Modifier le transporteur" : "Nouveau transporteur"}</h2><p className="text-xs text-slate-500">{editing ? `Code ${editing.code}` : "Un transporteur créé ici est toujours désactivé et sans tarif réel."}</p></div>
      </div>
      <form action={saveMethodAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Code<input name="code" required defaultValue={editing?.code} pattern="[a-z0-9_-]{2,30}" maxLength={30} className="ui-input" placeholder="air_express"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom commercial<input name="name" required defaultValue={editing?.name} minLength={2} maxLength={120} className="ui-input" placeholder="Livraison aérienne express"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Mode<select name="mode" defaultValue={editing?.mode || "air"} className="ui-input"><option value="air">Aérien</option><option value="sea">Maritime</option></select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Base de facturation<select name="billableBasis" defaultValue={editing?.billableBasis || "both"} className="ui-input"><option value="weight">Poids</option><option value="volume">Volume</option><option value="both">Le plus élevé des deux</option></select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Diviseur volumétrique<input name="volumetricDivisor" type="number" min={1000} max={20000} defaultValue={editing?.volumetricDivisor ?? 6000} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Poids mini facturé (kg)<input name="minimumBillableWeightKg" type="number" step="0.001" min={0} defaultValue={editing?.minimumBillableWeightKg ?? "0.5"} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Volume mini facturé (m³)<input name="seaMinimumVolumeM3" type="number" step="0.0001" min={0} defaultValue={editing?.seaMinimumVolumeM3 ?? "0.1"} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Frais minimum<input name="minimumChargeXof" type="number" min={0} defaultValue={editing?.minimumChargeXof ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Assurance (%)<input name="insurancePercent" type="number" step="0.01" min={0} max={100} defaultValue={editing?.insurancePercent ?? "0"} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Frais de douane<input name="customsHandlingXof" type="number" min={0} defaultValue={editing?.customsHandlingXof ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Surcharge fragile<input name="fragileSurchargeXof" type="number" min={0} defaultValue={editing?.fragileSurchargeXof ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Port offert dès<input name="freeAboveXof" type="number" min={0} defaultValue={editing?.freeAboveXof ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Port offert dès (g)<input name="freeAboveWeightGrams" type="number" min={0} defaultValue={editing?.freeAboveWeightGrams ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Hors barème<select name="outOfRangeBehavior" defaultValue={editing?.outOfRangeBehavior || "disable"} className="ui-input"><option value="disable">Refuser le devis</option><option value="use_highest">Appliquer la dernière tranche</option></select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Colis maxi (g)<input name="maxPackageWeightGrams" type="number" min={0} defaultValue={editing?.maxPackageWeightGrams ?? 30000} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Longueur maxi (cm)<input name="maxPackageLengthCm" type="number" min={0} defaultValue={editing?.maxPackageLengthCm ?? 150} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Délai mini (jours)<input name="transitDaysMin" type="number" min={0} max={365} defaultValue={editing?.transitDaysMin ?? 5} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Délai maxi (jours)<input name="transitDaysMax" type="number" min={0} max={365} defaultValue={editing?.transitDaysMax ?? 10} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2">Libellé de délai<input name="deliveryTimeLabel" maxLength={120} defaultValue={editing?.deliveryTimeLabel} className="ui-input" placeholder="7 à 12 jours ouvrés"/></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{editing ? "Enregistrer" : "Créer le transporteur"}</button>
          {editing && <a href="/transport/methodes" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Transporteurs enregistrés</h2><p className="text-xs text-slate-500">{methods.filter((method) => method.isActive).length} actif(s) sur {methods.length}</p></div>
      {methods.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1000px]">
        <thead><tr><th>Transporteur</th><th>Mode</th><th>Base</th><th>Grille</th><th>Délai</th><th>Statut</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{methods.map((method) => {
          const state = stateByMethod.get(method.id) || { real: 0, sample: 0 };
          return <tr key={method.id}>
            <td><div className="flex items-center gap-2">{method.mode === "air" ? <Plane size={16} className="text-slate-400"/> : <Ship size={16} className="text-slate-400"/>}<div><div className="font-semibold text-slate-900">{method.name}</div><div className="text-[11px] text-slate-500">{method.code}</div></div></div></td>
            <td>{method.mode === "air" ? "Aérien" : "Maritime"}</td>
            <td className="text-xs">{method.billableBasis === "weight" ? "Poids" : method.billableBasis === "volume" ? "Volume" : "Max poids/volume"}</td>
            <td className="text-xs">{state.real > 0 ? `${state.real} tranche(s) réelle(s)` : state.sample > 0 ? `${state.sample} tranche(s) d’exemple` : "aucune tranche"}</td>
            <td className="whitespace-nowrap">{method.transitDaysMin}–{method.transitDaysMax} j</td>
            <td><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${method.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{method.isActive ? "Actif" : "Inactif"}</span></td>
            <td><div className="flex justify-end gap-2">
              <a href={`/transport/methodes?edit=${method.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
              <form action={toggleMethodAction}><input type="hidden" name="id" value={method.id}/><button type="submit" className="text-xs font-semibold text-slate-700 hover:underline">{method.isActive ? "Désactiver" : "Activer"}</button></form>
              <form action={trashMethodAction}><input type="hidden" name="id" value={method.id}/><button type="submit" className="text-xs font-semibold text-red-700 hover:underline">Corbeille</button></form>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="admin-empty"><strong>Aucun transporteur</strong>Crée un transporteur puis saisis sa grille tarifaire.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>L’activation est refusée tant que la grille ne contient pas au moins une tranche réelle : aucune donnée d’exemple ne peut être facturée à un client. Exemple actuel de frais minimum : {money(0)}. Chaque création, activation et mise à la corbeille est auditée.</span></div>
    </Card>
  </>;
}
