import { asc, isNull } from "drizzle-orm";
import { Calculator, Plus, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import {
  adminShippingDiscountTiers,
  adminShippingMethods,
  adminShippingRates,
  adminShippingZones,
} from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { quoteShippingOptions, type DiscountTierInput, type MethodInput, type ZoneInput } from "@/lib/shipping-quote";

export const dynamic = "force-dynamic";

const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
const decimal = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value);

type Search = {
  country?: string;
  region?: string;
  city?: string;
  weight?: string;
  length?: string;
  width?: string;
  height?: string;
  quantity?: string;
  subtotal?: string;
  fragile?: string;
};

const number = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireEmployee("shipping.read");
  const params = await searchParams;

  const country = (params.country || "CI").trim().toUpperCase().slice(0, 2);
  const region = (params.region || "").trim().slice(0, 40);
  const city = (params.city || "").trim().slice(0, 120);
  const weightGrams = Math.round(number(params.weight, 2000, 1, 5_000_000));
  const lengthCm = number(params.length, 30, 0, 500);
  const widthCm = number(params.width, 20, 0, 500);
  const heightCm = number(params.height, 10, 0, 500);
  const quantity = Math.round(number(params.quantity, 1, 1, 1000));
  const subtotalXof = Math.round(number(params.subtotal, 100000, 0, 1_000_000_000));
  const isFragile = params.fragile === "1";

  const db = getAdminDb();
  const [methodRows, zoneRows, rateRows, tierRows] = await Promise.all([
    db.select().from(adminShippingMethods).where(isNull(adminShippingMethods.deletedAt)).orderBy(asc(adminShippingMethods.name)),
    db.select().from(adminShippingZones).where(isNull(adminShippingZones.deletedAt)).orderBy(asc(adminShippingZones.sortOrder)),
    db.select().from(adminShippingRates),
    db.select().from(adminShippingDiscountTiers),
  ]);

  const ratesByMethod = new Map<string, typeof rateRows>();
  for (const rate of rateRows) {
    const list = ratesByMethod.get(rate.shippingMethodId) ?? [];
    list.push(rate);
    ratesByMethod.set(rate.shippingMethodId, list);
  }
  const tiersByMethod = new Map<string, DiscountTierInput[]>();
  for (const tier of tierRows) {
    const list = tiersByMethod.get(tier.shippingMethodId) ?? [];
    list.push({
      shippingZoneId: tier.shippingZoneId,
      minimumBillableUnits: tier.minimumBillableUnits,
      discountPercent: tier.discountPercent,
      isActive: tier.isActive,
      label: tier.label,
    });
    tiersByMethod.set(tier.shippingMethodId, list);
  }

  const methods: MethodInput[] = methodRows.map((method) => ({
    id: method.id, code: method.code, name: method.name, mode: method.mode as "air" | "sea",
    isActive: method.isActive, sampleRatesOnly: method.sampleRatesOnly, deletedAt: method.deletedAt,
    billableBasis: method.billableBasis as "weight" | "volume" | "both",
    volumetricDivisor: method.volumetricDivisor,
    minimumBillableWeightKg: method.minimumBillableWeightKg,
    seaMinimumVolumeM3: method.seaMinimumVolumeM3,
    minimumChargeXof: method.minimumChargeXof,
    insurancePercent: method.insurancePercent,
    customsHandlingXof: method.customsHandlingXof,
    fragileSurchargeXof: method.fragileSurchargeXof,
    transitDaysMin: method.transitDaysMin,
    transitDaysMax: method.transitDaysMax,
    freeAboveXof: method.freeAboveXof,
    freeAboveWeightGrams: method.freeAboveWeightGrams,
    outOfRangeBehavior: method.outOfRangeBehavior === "use_highest" ? "use_highest" : "disable",
    maxPackageWeightGrams: method.maxPackageWeightGrams,
    maxPackageLengthCm: method.maxPackageLengthCm,
    deliveryTimeLabel: method.deliveryTimeLabel,
    rates: ratesByMethod.get(method.id) ?? [],
    discounts: tiersByMethod.get(method.id) ?? [],
  }));

  const zones: ZoneInput[] = zoneRows.map((zone) => ({
    id: zone.id, code: zone.code, name: zone.name, countryCodes: zone.countryCodes,
    regionCodes: zone.regionCodes, cityNames: zone.cityNames, isActive: zone.isActive,
    isDefault: zone.isDefault, sortOrder: zone.sortOrder, deletedAt: zone.deletedAt,
  }));

  const result = quoteShippingOptions(methods, zones, {
    countryCode: country,
    regionCode: region || null,
    city: city || null,
    packages: [{ lengthCm, widthCm, heightCm, weightGrams, quantity }],
    subtotalXof,
    isFragile,
  });

  const reasonLabels: Record<string, string> = {
    inactive: "Désactivé",
    no_rate: "Aucune tranche tarifaire",
    out_of_range: "Hors barème",
    mode_not_allowed: "Mode non autorisé",
    package_too_large: "Colis hors gabarit",
    sample_rates: "Tarifs d'exemple",
    no_zone: "Aucune zone",
    no_package: "Panier vide",
  };

  return <>
    <div className="admin-breadcrumb"><span>Opérations</span><span>/</span><span>Transport</span><span>/</span><strong>Simulateur</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Simulateur de devis</h1><p className="admin-page-subtitle">Chiffre un envoi avec exactement le moteur utilisé par l&apos;API publique. Les transporteurs d&apos;exemple apparaissent mais ne sont pas facturables.</p></div>
    </div>

    <Card className="mb-5 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><Calculator size={19}/></div>
        <div><h2 className="font-bold text-slate-950">Paramètres de l&apos;envoi</h2><p className="text-xs text-slate-500">Dimensions en centimètres, poids en grammes.</p></div>
      </div>
      <form method="get" className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Pays (ISO-2)<input name="country" defaultValue={country} maxLength={2} className="ui-input" required/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Région<input name="region" defaultValue={region} maxLength={40} className="ui-input" placeholder="BOUAKE"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Ville<input name="city" defaultValue={city} maxLength={120} className="ui-input" placeholder="Abidjan"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Sous-total HT (FCFA)<input name="subtotal" type="number" min={0} defaultValue={subtotalXof} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Poids unitaire (g)<input name="weight" type="number" min={1} defaultValue={weightGrams} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Longueur (cm)<input name="length" type="number" step="0.1" min={0} defaultValue={lengthCm} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Largeur (cm)<input name="width" type="number" step="0.1" min={0} defaultValue={widthCm} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Hauteur (cm)<input name="height" type="number" step="0.1" min={0} defaultValue={heightCm} className="ui-input"/></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Quantité<input name="quantity" type="number" min={1} defaultValue={quantity} className="ui-input"/></label>
        <label className="flex items-center gap-2 pt-5 text-xs font-semibold text-slate-700"><input type="checkbox" name="fragile" value="1" defaultChecked={isFragile} className="size-4 rounded border-slate-300"/> Colis fragile</label>
        <div className="flex items-end gap-2 sm:col-span-2"><button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"><Calculator size={15}/>Calculer</button><a href="/transport/simulateur" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">Réinitialiser</a></div>
      </form>
    </Card>

    <div className="mb-5 grid gap-4 sm:grid-cols-4">
      <Card className="p-4"><div className="text-xs text-slate-500">Zone résolue</div><strong className="text-sm">{result.zone ? `${result.zone.name} (${result.zone.code})` : "aucune"}</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Poids réel / volumétrique</div><strong className="text-sm">{decimal(result.totals.actualWeightKg)} kg / {decimal(result.totals.volumeCm3 / (Number(methods[0]?.volumetricDivisor) || 6000))} kg</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Volume</div><strong className="text-sm">{decimal(result.totals.volumeM3)} m³</strong></Card>
      <Card className="p-4"><div className="text-xs text-slate-500">Options proposées</div><strong className="text-sm">{result.options.length}</strong></Card>
    </div>

    <Card className="mb-5 overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Devis calculé</h2><p className="text-xs text-slate-500">{result.available ? `Le moins cher : ${result.cheapestMethodCode} · le plus rapide : ${result.fastestMethodCode}` : "Aucune option disponible pour cet envoi."}</p></div>
      {result.options.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1100px]">
        <thead><tr><th>Transporteur</th><th>Unités facturables</th><th>Fret</th><th>Remise</th><th>Approche</th><th>Douane</th><th>Assurance</th><th>Fragile</th><th>Total</th><th>Délai</th><th>Facturable</th></tr></thead>
        <tbody>{result.options.map((option) => <tr key={option.methodId}>
          <td><div className="font-semibold text-slate-900">{option.methodName}</div><div className="text-[11px] text-slate-500">{option.mode === "air" ? "Aérien" : "Maritime"} · {option.rateLabel}</div></td>
          <td className="whitespace-nowrap">{decimal(option.chargeableUnits)} {option.unit}</td>
          <td className="whitespace-nowrap">{money(option.baseRateXof)}</td>
          <td className="whitespace-nowrap text-xs">{option.discountPercent ? `−${money(option.discountXof)} (${option.discountPercent} %)` : "—"}</td>
          <td className="whitespace-nowrap">{money(option.handlingFeeXof)}</td>
          <td className="whitespace-nowrap">{money(option.customsXof)}</td>
          <td className="whitespace-nowrap">{money(option.insuranceXof)}</td>
          <td className="whitespace-nowrap">{money(option.fragileXof)}</td>
          <td className="whitespace-nowrap font-bold">{money(option.totalXof)}{option.freeShipping && <span className="ml-1 text-[10px] font-semibold text-emerald-700">port offert</span>}</td>
          <td className="whitespace-nowrap text-xs">{option.transitDaysMin}–{option.transitDaysMax} j</td>
          <td><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${option.billable ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{option.billable ? "Oui" : "Exemple"}</span></td>
        </tr>)}</tbody>
      </table></div> : <div className="admin-empty"><Plus size={24} className="mb-2 text-slate-400"/><strong>Rien à proposer</strong>{result.zone ? "Aucun transporteur actif ne couvre cet envoi : vérifie les grilles, le gabarit et la zone." : "Aucune zone ne couvre ce pays. Crée une zone ou désigne une zone par défaut."}</div>}
      <div className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500"><TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/><span>Les montants sont arrondis au multiple de 25 FCFA. Une option « Exemple » provient du jeu de démonstration : elle peut être simulée mais jamais facturée.</span></div>
    </Card>

    {result.unavailable.length > 0 && <Card className="overflow-hidden">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-950">Transporteurs écartés</h2><p className="text-xs text-slate-500">Chaque refus est explicité pour corriger la configuration.</p></div>
      <div className="divide-y divide-slate-100">{result.unavailable.map((entry) => <div key={entry.methodCode} className="flex items-center justify-between gap-3 p-4">
        <div><div className="font-semibold text-slate-900">{entry.methodName}</div><div className="text-xs text-slate-500">{entry.detail}</div></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{reasonLabels[entry.reason] || entry.reason}</span>
      </div>)}</div>
    </Card>}
  </>;
}
