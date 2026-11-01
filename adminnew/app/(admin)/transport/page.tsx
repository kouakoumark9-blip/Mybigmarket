import { asc, eq } from "drizzle-orm";
import { Ship, Truck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminShippingMethods, adminShippingRates, adminShippingZones } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;

export default async function ShippingPage() {
  await requireEmployee("shipping.read");
  const db = getAdminDb();
  const [methods, zones, rates] = await Promise.all([
    db.select().from(adminShippingMethods).orderBy(asc(adminShippingMethods.name)),
    db.select().from(adminShippingZones).orderBy(asc(adminShippingZones.name)),
    db.select({ id: adminShippingRates.id, methodName: adminShippingMethods.name, mode: adminShippingMethods.mode, zoneName: adminShippingZones.name, minimum: adminShippingRates.minimumBillableUnits, maximum: adminShippingRates.maximumBillableUnits, rate: adminShippingRates.rateXofPerUnit, sampleOnly: adminShippingRates.sampleOnly })
      .from(adminShippingRates).innerJoin(adminShippingMethods, eq(adminShippingRates.shippingMethodId, adminShippingMethods.id)).innerJoin(adminShippingZones, eq(adminShippingRates.shippingZoneId, adminShippingZones.id)).orderBy(asc(adminShippingZones.name), asc(adminShippingMethods.name), asc(adminShippingRates.sortOrder)).limit(150),
  ]);
  const activeMethods = methods.filter((method) => method.isActive).length;
  const sampleRates = rates.filter((rate) => rate.sampleOnly).length;

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><strong>Transport</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Transport</h1><p className="admin-page-subtitle">Méthodes, zones et grilles de tarifs enregistrées.</p></div></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-3"><Card className="flex items-center gap-3 p-4"><Truck size={19} className="text-slate-600"/><div><div className="text-xs text-slate-500">Méthodes actives</div><strong className="text-lg">{activeMethods} / {methods.length}</strong></div></Card><Card className="flex items-center gap-3 p-4"><Ship size={19} className="text-slate-600"/><div><div className="text-xs text-slate-500">Zones configurées</div><strong className="text-lg">{zones.length}</strong></div></Card><Card className="flex items-center gap-3 p-4"><TriangleAlert size={19} className="text-amber-700"/><div><div className="text-xs text-slate-500">Tarifs d’exemple</div><strong className="text-lg">{sampleRates}</strong></div></Card></div>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Méthodes et zones</h2></div><div className="divide-y divide-slate-100">{methods.map((method) => <div key={method.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{method.name}</h3><p className="text-xs text-slate-500">{method.code} · {method.mode === "air" ? "Aérien" : method.mode === "sea" ? "Maritime" : method.mode}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${method.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{method.isActive ? "Active" : "Désactivée"}</span></div><p className="mt-2 text-xs text-slate-500">Délai indiqué : {method.transitDaysMin}–{method.transitDaysMax} jours · {method.sampleRatesOnly ? "Tarifs illustratifs" : "Tarifs à vérifier"}</p></div>)}{!methods.length && <div className="admin-empty"><strong>Aucune méthode</strong>Les méthodes de transport apparaîtront après leur configuration.</div>}</div><div className="border-t border-slate-100 p-5"><h3 className="mb-3 text-sm font-bold text-slate-900">Zones</h3><div className="flex flex-wrap gap-2">{zones.map((zone) => <span key={zone.id} className={`rounded-full border px-3 py-1.5 text-xs ${zone.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>{zone.name} · {zone.countryCodes.length} pays</span>)}</div></div></Card>
      <Card className="overflow-hidden"><div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Grilles de tarifs</h2><p className="mt-1 text-xs text-slate-500">Affichage en FCFA par unité facturable indiquée.</p></div>{rates.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[650px]"><thead><tr><th>Zone</th><th>Mode</th><th>Unité min.–max.</th><th>Tarif</th><th>Nature</th></tr></thead><tbody>{rates.map((rate) => <tr key={rate.id}><td>{rate.zoneName}</td><td>{rate.mode === "air" ? "Aérien" : "Maritime"}</td><td>{rate.minimum} – {rate.maximum || "∞"}</td><td className="font-semibold">{money(rate.rate)}</td><td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rate.sampleOnly ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{rate.sampleOnly ? "Exemple" : "À valider"}</span></td></tr>)}</tbody></table></div> : <div className="admin-empty"><strong>Aucun tarif</strong>Les tarifs s’afficheront ici lorsqu’ils seront configurés.</div>}<div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Les tarifs seedés sont des exemples et ne doivent pas être utilisés pour facturer un client sans validation du transporteur.</span></div></Card>
    </div>
  </>;
}
