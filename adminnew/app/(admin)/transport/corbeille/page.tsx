import { desc, isNotNull, isNull } from "drizzle-orm";
import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminShippingMethods, adminShippingRates, adminShippingZones } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { restoreMethodAction } from "../actions";

export const dynamic = "force-dynamic";

const formatDate = (value: Date | null) => (value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—");

const noticeText: Record<string, { tone: string; text: string }> = {
  restored: { tone: "border-emerald-200 bg-emerald-50 text-emerald-800", text: "Transporteur restauré, toujours désactivé : réactive-le après vérification de sa grille." },
  missing: { tone: "border-amber-200 bg-amber-50 text-amber-800", text: "Élément introuvable ou déjà hors corbeille." },
  invalid: { tone: "border-red-200 bg-red-50 text-red-800", text: "Demande invalide." },
};

export default async function ShippingTrashPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("shipping.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const [methods, zones, rates] = await Promise.all([
    db.select({
      id: adminShippingMethods.id, name: adminShippingMethods.name, code: adminShippingMethods.code,
      mode: adminShippingMethods.mode, deletedAt: adminShippingMethods.deletedAt,
    }).from(adminShippingMethods).where(isNotNull(adminShippingMethods.deletedAt)).orderBy(desc(adminShippingMethods.deletedAt)),
    db.select({
      id: adminShippingZones.id, name: adminShippingZones.name, code: adminShippingZones.code,
      deletedAt: adminShippingZones.deletedAt,
    }).from(adminShippingZones).where(isNotNull(adminShippingZones.deletedAt)).orderBy(desc(adminShippingZones.deletedAt)),
    db.select({
      id: adminShippingRates.id, minimum: adminShippingRates.minimumBillableUnits,
      maximum: adminShippingRates.maximumBillableUnits, rate: adminShippingRates.rateXofPerUnit,
      deletedAt: adminShippingRates.deletedAt,
    }).from(adminShippingRates).where(isNotNull(adminShippingRates.deletedAt)).orderBy(desc(adminShippingRates.deletedAt)).limit(100),
  ]);
  const activeMethods = await db.select({ id: adminShippingMethods.id }).from(adminShippingMethods).where(isNull(adminShippingMethods.deletedAt));
  const total = methods.length + zones.length + rates.length;

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><span>Transport</span><span>/</span><strong>Corbeille</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Corbeille transport</h1><p className="admin-page-subtitle">Transporteurs, zones et tranches retirés du service. Aucun historique de commande n&apos;est effacé.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{total} élément(s)</span>
    </div>
    {notice && <p className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${notice.tone}`} role="status">{notice.text}</p>}

    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Transporteurs supprimés</h2><p className="text-xs text-slate-500">{methods.length} transporteur(s) · {activeMethods.length} encore actif(s)</p></div>
      {methods.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[720px]">
        <thead><tr><th>Transporteur</th><th>Mode</th><th>Supprimé le</th><th className="text-right">Action</th></tr></thead>
        <tbody>{methods.map((method) => <tr key={method.id}>
          <td><div className="font-semibold text-slate-900">{method.name}</div><div className="text-[11px] text-slate-500">{method.code}</div></td>
          <td>{method.mode === "air" ? "Aérien" : "Maritime"}</td>
          <td className="whitespace-nowrap text-slate-600">{formatDate(method.deletedAt)}</td>
          <td className="text-right"><form action={restoreMethodAction}><input type="hidden" name="id" value={method.id}/><button type="submit" className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"><RotateCcw size={13}/>Restaurer</button></form></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Trash2 size={24} className="mb-2 text-slate-400"/><strong>Aucun transporteur supprimé</strong>Les transporteurs mis à la corbeille apparaîtront ici.</div>}
    </Card>

    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Zones supprimées</h2><p className="text-xs text-slate-500">{zones.length} zone(s)</p></div>
        {zones.length ? <div className="divide-y divide-slate-100">{zones.map((zone) => <div key={zone.id} className="flex items-center justify-between p-4">
          <div><div className="font-semibold text-slate-900">{zone.name}</div><div className="text-xs text-slate-500">{zone.code} · supprimée le {formatDate(zone.deletedAt)}</div></div>
        </div>)}</div> : <div className="admin-empty"><strong>Aucune zone supprimée</strong>Une zone supprimée conserve son historique de commandes.</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Tranches supprimées</h2><p className="text-xs text-slate-500">{rates.length} tranche(s) — 100 plus récentes</p></div>
        {rates.length ? <div className="divide-y divide-slate-100">{rates.map((rate) => <div key={rate.id} className="flex items-center justify-between p-4">
          <div><div className="font-semibold text-slate-900">De {Number(rate.minimum)} à {rate.maximum ? Number(rate.maximum) : "∞"}</div><div className="text-xs text-slate-500">{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(rate.rate)} FCFA · supprimée le {formatDate(rate.deletedAt)}</div></div>
        </div>)}</div> : <div className="admin-empty"><strong>Aucune tranche supprimée</strong>Les tranches retirées apparaîtront ici.</div>}
      </Card>
    </div>

    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Seuls les transporteurs disposent d&apos;une restauration depuis cet écran : une zone ou une tranche restaurée doit d&apos;abord être revérifiée, car ses bornes peuvent chevaucher une grille créée depuis. Toutes les actions sont auditées.</span></p>
  </>;
}
