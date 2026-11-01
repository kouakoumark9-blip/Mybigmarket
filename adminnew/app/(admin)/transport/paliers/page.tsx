import { asc, eq, isNull } from "drizzle-orm";
import { BadgePercent, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminShippingDiscountTiers, adminShippingMethods, adminShippingZones } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { deleteTierAction, saveTierAction } from "../actions";

export const dynamic = "force-dynamic";

const noticeText: Record<string, { tone: string; text: string }> = {
  saved: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Palier de remise enregistré." },
  deleted: { tone: "border-slate-200 bg-slate-50 text-slate-700", text: "Palier supprimé." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Formulaire invalide : vérifie le seuil et le pourcentage." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Palier introuvable." },
};

export default async function TiersPage({ searchParams }: { searchParams: Promise<{ notice?: string; edit?: string }> }) {
  await requireEmployee("shipping.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const [methods, zones, tiers] = await Promise.all([
    db.select().from(adminShippingMethods).where(isNull(adminShippingMethods.deletedAt)).orderBy(asc(adminShippingMethods.name)),
    db.select().from(adminShippingZones).where(isNull(adminShippingZones.deletedAt)).orderBy(asc(adminShippingZones.sortOrder)),
    db.select({
      id: adminShippingDiscountTiers.id,
      methodId: adminShippingDiscountTiers.shippingMethodId,
      zoneId: adminShippingDiscountTiers.shippingZoneId,
      methodName: adminShippingMethods.name,
      zoneName: adminShippingZones.name,
      minimum: adminShippingDiscountTiers.minimumBillableUnits,
      percent: adminShippingDiscountTiers.discountPercent,
      label: adminShippingDiscountTiers.label,
      isActive: adminShippingDiscountTiers.isActive,
    })
      .from(adminShippingDiscountTiers)
      .innerJoin(adminShippingMethods, eq(adminShippingDiscountTiers.shippingMethodId, adminShippingMethods.id))
      .leftJoin(adminShippingZones, eq(adminShippingDiscountTiers.shippingZoneId, adminShippingZones.id))
      .orderBy(asc(adminShippingMethods.name), asc(adminShippingDiscountTiers.minimumBillableUnits)),
  ]);
  const editing = params.edit ? tiers.find((tier) => tier.id === params.edit) : undefined;

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><span>Transport</span><span>/</span><strong>Paliers de remise</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Paliers de remise sur le port</h1><p className="admin-page-subtitle">Remise dégressive appliquée au fret dès un seuil d&apos;unités facturables. Seul le palier le plus élevé atteint s&apos;applique ; jamais la douane.</p></div>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><BadgePercent size={19}/></div>
        <div><h2 className="font-bold text-slate-950">{editing ? "Modifier le palier" : "Nouveau palier"}</h2><p className="text-xs text-slate-500">Laisser la zone vide applique le palier à toutes les zones du transporteur.</p></div>
      </div>
      <form action={saveTierAction} className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {editing && <input type="hidden" name="id" value={editing.id}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Transporteur<select name="methodId" required defaultValue={editing?.methodId} className="ui-input">{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Zone (facultatif)<select name="zoneId" defaultValue={editing?.zoneId ?? ""} className="ui-input"><option value="">Toutes les zones</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Dès (unités facturables)<input name="minimumBillableUnits" type="number" step="0.0001" min={0} required defaultValue={editing?.minimum ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Remise (%)<input name="discountPercent" type="number" step="0.01" min={0} max={100} required defaultValue={editing?.percent ?? 0} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-4">Libellé<input name="label" maxLength={120} defaultValue={editing?.label} className="ui-input" placeholder="10 % dès 100 kg"/></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">{editing ? "Enregistrer" : "Ajouter le palier"}</button>
          {editing && <a href="/transport/paliers" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Annuler</a>}
        </div>
      </form>
    </Card>

    <Card className="overflow-hidden">
      {tiers.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[820px]">
        <thead><tr><th>Transporteur</th><th>Zone</th><th>Dès</th><th>Remise</th><th>Libellé</th><th className="text-right">Actions</th></tr></thead>
        <tbody>{tiers.map((tier) => <tr key={tier.id}>
          <td className="font-semibold text-slate-900">{tier.methodName}</td>
          <td>{tier.zoneName || "Toutes les zones"}</td>
          <td className="whitespace-nowrap">{Number(tier.minimum)}</td>
          <td className="font-semibold">{Number(tier.percent)} %</td>
          <td className="text-xs text-slate-600">{tier.label || "—"}</td>
          <td><div className="flex justify-end gap-2">
            <a href={`/transport/paliers?edit=${tier.id}`} className="text-xs font-semibold text-orange-700 hover:underline">Modifier</a>
            <form action={deleteTierAction}><input type="hidden" name="id" value={tier.id}/><button type="submit" className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
          </div></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><BadgePercent size={24} className="mb-2 text-slate-400"/><strong>Aucun palier</strong>Les paliers encouragent les gros volumes en réduisant le fret à partir d&apos;un seuil.</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Les paliers se suppriment réellement : ils ne portent aucun historique commercial, contrairement aux transporteurs et aux tranches. Toute suppression est auditée.</span></div>
    </Card>
  </>;
}
