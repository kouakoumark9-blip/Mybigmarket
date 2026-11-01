/**
 * COPIE SYNCHRONISÉE de `lib/shipping-quote.ts` (racine du dépôt).
 *
 * adminnew est un projet Next séparé : il ne peut pas importer hors de sa
 * racine. Pour éviter que la logique tarifaire diverge entre le storefront et

 * le simulateur d'administration, ce fichier est une copie **octet pour octet**.
 * Le test `tests/shipping-quote-sync.test.ts` échoue si les deux versions
 * diffèrent : modifie la version racine puis recopie.
 */

import {
  aggregatePackages,
  findRate,
  roundXof,
  type CarrierConfig,
  type PackageInput,
  type RateRow,
  type ShippingMode,
} from "./shipping-calc";

export type BillableBasis = "weight" | "volume" | "both";

export type ZoneInput = {
  id: string;
  code: string;
  name: string;
  countryCodes: string[];
  regionCodes?: string[];
  cityNames?: string[];
  isActive: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  deletedAt?: Date | null;
};

export type RateTierInput = {
  id?: string;
  minimumBillableUnits: number | string;
  maximumBillableUnits: number | string | null;
  rateXofPerUnit: number;
  minimumChargeXof?: number | null;
  handlingFeeXof?: number | null;
  customsFeeXof?: number | null;
  transitDaysMin?: number | null;
  transitDaysMax?: number | null;
  label?: string;
  isActive?: boolean;
  deletedAt?: Date | null;
  validFrom?: Date | null;
  validTo?: Date | null;
};

export type DiscountTierInput = {
  shippingZoneId?: string | null;
  minimumBillableUnits: number | string;
  discountPercent: number | string;
  isActive?: boolean;
  label?: string;
};

export type MethodInput = {
  id: string;
  code: string;
  name: string;
  mode: ShippingMode;
  isActive: boolean;
  sampleRatesOnly: boolean;
  deletedAt?: Date | null;
  billableBasis?: BillableBasis | null;
  volumetricDivisor?: number | null;
  minimumBillableWeightKg?: number | string | null;
  seaMinimumVolumeM3?: number | string | null;
  minimumChargeXof?: number | null;
  insurancePercent?: number | string | null;
  customsHandlingXof?: number | null;
  fragileSurchargeXof?: number | null;
  transitDaysMin: number;
  transitDaysMax: number;
  freeAboveXof?: number | null;
  freeAboveWeightGrams?: number | null;
  outOfRangeBehavior?: "disable" | "use_highest" | null;
  maxPackageWeightGrams?: number | null;
  maxPackageLengthCm?: number | null;
  deliveryTimeLabel?: string | null;
  rates: RateTierInput[];
  discounts?: DiscountTierInput[];
};

export type QuoteRequest = {
  countryCode: string;
  regionCode?: string | null;
  city?: string | null;
  packages: PackageInput[];
  subtotalXof: number;
  declaredValueXof?: number;
  isFragile?: boolean;
  /** Restriction produit (`product_packaging.shipping_preference`). */
  preference?: "air_only" | "sea_only" | "both" | "automatic";
  /** Force une zone (usage interne/admin), sinon résolution automatique. */
  forcedZoneCode?: string | null;
  now?: Date;
};

export type QuoteOption = {
  methodId: string;
  methodCode: string;
  methodName: string;
  mode: ShippingMode;
  /** `false` si la grille est encore une grille d'exemple : ne pas facturer. */
  billable: boolean;
  zoneCode: string;
  zoneName: string;
  billableBasis: BillableBasis;
  chargeableUnits: number;
  unit: "kg" | "m3";
  actualWeightKg: number;
  volumetricWeightKg: number;
  volumeM3: number;
  baseRateXof: number;
  discountPercent: number;
  discountXof: number;
  handlingFeeXof: number;
  customsXof: number;
  insuranceXof: number;
  fragileXof: number;
  freeShipping: boolean;
  totalXof: number;
  transitDaysMin: number;
  transitDaysMax: number;
  deliveryTimeLabel: string;
  rateLabel: string;
};

export type UnavailableReason =
  | "no_package"
  | "no_zone"
  | "no_rate"
  | "out_of_range"
  | "inactive"
  | "sample_rates"
  | "mode_not_allowed"
  | "package_too_large";

export type UnavailableOption = {
  methodCode: string;
  methodName: string;
  mode: ShippingMode;
  reason: UnavailableReason;
  detail: string;
};

export type QuoteResponse = {
  available: boolean;
  zone: { code: string; name: string } | null;
  totals: { weightGrams: number; volumeCm3: number; volumeM3: number; actualWeightKg: number; packageCount: number };
  options: QuoteOption[];
  unavailable: UnavailableOption[];
  /** Option la moins chère, et la plus rapide : aide à l'affichage. */
  cheapestMethodCode: string | null;
  fastestMethodCode: string | null;
  recommendedMode: ShippingMode | null;
  sampleOnly: boolean;
};

const num = (value: number | string | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Résout la zone de livraison.
 * Priorité : ville > région > pays > zone par défaut.
 * Une zone inactive ou supprimée est ignorée ; deux zones de même priorité
 * sont départagées par `sortOrder`.
 */
export function resolveZone(zones: ZoneInput[], request: { countryCode: string; regionCode?: string | null; city?: string | null }): ZoneInput | null {
  const country = request.countryCode.trim().toUpperCase();
  const region = (request.regionCode || "").trim().toUpperCase();
  const city = (request.city || "").trim().toLowerCase();
  const candidates = zones.filter((zone) => !zone.deletedAt && zone.isActive && zone.countryCodes.some((code) => code.toUpperCase() === country));
  if (!candidates.length) {
    return zones.find((zone) => !zone.deletedAt && zone.isActive && zone.isDefault) ?? null;
  }

  const scored = candidates.map((zone) => {
    const cities = (zone.cityNames || []).map((value) => value.trim().toLowerCase());
    const regions = (zone.regionCodes || []).map((value) => value.trim().toUpperCase());
    let score = 0;
    if (city && cities.includes(city)) score += 4;
    if (region && regions.includes(region)) score += 2;
    // Une zone sans restriction géographique supplémentaire reste applicable.
    if (!cities.length && !regions.length) score += 1;
    return { zone, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.zone.sortOrder ?? 0) - (b.zone.sortOrder ?? 0) || a.zone.code.localeCompare(b.zone.code));
  return scored[0].score > 0 ? scored[0].zone : null;
}

/** Filtre les tranches réellement utilisables à une date donnée. */
export function usableRates(rates: RateTierInput[], now: Date): RateTierInput[] {
  return rates.filter((rate) => {
    if (rate.isActive === false || rate.deletedAt) return false;
    if (rate.validFrom && rate.validFrom.getTime() > now.getTime()) return false;
    if (rate.validTo && rate.validTo.getTime() < now.getTime()) return false;
    return true;
  });
}

/** Base de facturation effective : l'avion est facturé au poids, le bateau au volume. */
export function effectiveBasis(method: Pick<MethodInput, "mode" | "billableBasis">): BillableBasis {
  const declared = method.billableBasis ?? null;
  if (declared === "weight" || declared === "volume" || declared === "both") return declared;
  return method.mode === "air" ? "weight" : "volume";
}

/**
 * Unités facturables selon la base :
 *  - weight : max(poids réel, poids volumétrique, minimum) — convention avion ;
 *  - volume : max(m³, tonnes, minimum m³) — convention bateau ;
 *  - both   : le maximum des deux, pour une méthode mixte.
 */
export function chargeableUnitsFor(
  method: MethodInput,
  basis: BillableBasis,
  totals: ReturnType<typeof aggregatePackages>,
): { units: number; unit: "kg" | "m3"; volumetricKg: number } {
  const divisor = num(method.volumetricDivisor, 6000) || 6000;
  const volumetricKg = totals.volumeCm3 / divisor;
  const weightUnits = Math.max(totals.actualWeightKg, volumetricKg, num(method.minimumBillableWeightKg, 0));
  const minimumM3 = num(method.seaMinimumVolumeM3, 0.1);
  const volumeUnits = Math.max(totals.volumeM3, totals.actualWeightKg / 1000, minimumM3);
  if (basis === "weight") return { units: weightUnits, unit: "kg", volumetricKg };
  if (basis === "volume") return { units: volumeUnits, unit: "m3", volumetricKg };
  return weightUnits >= volumeUnits
    ? { units: weightUnits, unit: "kg", volumetricKg }
    : { units: volumeUnits, unit: "m3", volumetricKg };
}

/** Palier de remise applicable : le plus haut seuil atteint (et non le premier). */
export function applicableDiscount(method: MethodInput, zoneCode: string, units: number): DiscountTierInput | null {
  const tiers = (method.discounts || [])
    .filter((tier) => tier.isActive !== false)
    .filter((tier) => !tier.shippingZoneId || tier.shippingZoneId === zoneCode || tier.shippingZoneId === method.id)
    .sort((a, b) => num(b.minimumBillableUnits) - num(a.minimumBillableUnits));
  return tiers.find((tier) => units >= num(tier.minimumBillableUnits)) ?? null;
}

function preferenceAllows(preference: QuoteRequest["preference"], mode: ShippingMode): boolean {
  if (!preference || preference === "both" || preference === "automatic") return true;
  if (preference === "air_only") return mode === "air";
  return mode === "sea";
}

/** Contrôle de gabarit : un colis trop lourd ou trop long n'est pas accepté. */
function packageFits(method: MethodInput, packages: PackageInput[]): { ok: boolean; detail: string } {
  const maxWeight = num(method.maxPackageWeightGrams, 0);
  const maxLength = num(method.maxPackageLengthCm, 0);
  for (const item of packages) {
    if (maxWeight > 0 && item.weightGrams > maxWeight) {
      return { ok: false, detail: `Colis de ${(item.weightGrams / 1000).toFixed(1)} kg au-delà du maximum de ${(maxWeight / 1000).toFixed(1)} kg` };
    }
    const longest = Math.max(item.lengthCm, item.widthCm, item.heightCm);
    if (maxLength > 0 && longest > maxLength) {
      return { ok: false, detail: `Dimension ${longest} cm au-delà du maximum de ${maxLength} cm` };
    }
  }
  return { ok: true, detail: "" };
}

function toCarrierConfig(method: MethodInput): CarrierConfig {
  return {
    mode: method.mode,
    volumetricDivisor: num(method.volumetricDivisor, 6000),
    minimumBillableWeightKg: method.minimumBillableWeightKg ?? 0,
    seaMinimumVolumeM3: method.seaMinimumVolumeM3 ?? 0.1,
    freeAboveXof: method.freeAboveXof ?? null,
    freeAboveWeightGrams: method.freeAboveWeightGrams ?? null,
    minimumChargeXof: method.minimumChargeXof ?? 0,
    insurancePercent: method.insurancePercent ?? 0,
    customsHandlingXof: method.customsHandlingXof ?? 0,
    fragileSurchargeXof: method.fragileSurchargeXof ?? 0,
    outOfRangeBehavior: method.outOfRangeBehavior ?? "disable",
  };
}

/** Construit une option chiffrée pour un transporteur, ou explique le refus. */
export function quoteMethod(
  method: MethodInput,
  zone: ZoneInput,
  request: QuoteRequest,
): { option: QuoteOption } | { unavailable: UnavailableOption } {
  const now = request.now ?? new Date();
  const packages = request.packages.filter((item) => item.quantity > 0);
  const refuse = (reason: UnavailableReason, detail: string) => ({
    unavailable: { methodCode: method.code, methodName: method.name, mode: method.mode, reason, detail } as UnavailableOption,
  });

  if (method.deletedAt) return refuse("inactive", "Transporteur supprimé");
  if (!method.isActive) return refuse("inactive", "Transporteur désactivé");
  if (!preferenceAllows(request.preference, method.mode)) {
    return refuse("mode_not_allowed", method.mode === "air" ? "Produit expédié uniquement par bateau" : "Produit expédié uniquement par avion");
  }

  const fits = packageFits(method, packages);
  if (!fits.ok) return refuse("package_too_large", fits.detail);

  const totals = aggregatePackages(packages);
  const basis = effectiveBasis(method);
  const { units, unit, volumetricKg } = chargeableUnitsFor(method, basis, totals);
  const rates = usableRates(method.rates, now) as RateRow[];
  if (!rates.length) return refuse("no_rate", "Aucune tranche tarifaire active pour ce transporteur");

  const { rate, highest } = findRate(rates, units);
  let effectiveRate = rate;
  if (!effectiveRate) {
    if ((method.outOfRangeBehavior ?? "disable") === "disable" || !highest) {
      return refuse("out_of_range", `Quantité facturable de ${units.toFixed(2)} ${unit} hors barème`);
    }
    effectiveRate = highest;
  }

  const rawRate = effectiveRate as unknown as RateTierInput;
  const baseRateXof = Math.max(
    Math.round(units * effectiveRate.rateXofPerUnit),
    num(effectiveRate.minimumChargeXof ?? method.minimumChargeXof, 0),
  );

  const discount = applicableDiscount(method, zone.code, units);
  const discountPercent = discount ? Math.min(100, Math.max(0, num(discount.discountPercent))) : 0;
  const discountXof = Math.round((baseRateXof * discountPercent) / 100);

  const config = toCarrierConfig(method);
  const declaredValue = request.declaredValueXof ?? request.subtotalXof;
  const insuranceXof = Math.round((declaredValue * num(config.insurancePercent, 0)) / 100);
  const customsXof = Math.round(num(config.customsHandlingXof, 0) + num(rawRate.customsFeeXof, 0));
  const fragileXof = request.isFragile ? Math.round(num(config.fragileSurchargeXof, 0)) : 0;
  const handlingFeeXof = Math.round(num(rawRate.handlingFeeXof, 0));

  const freeThreshold = num(method.freeAboveXof, 0);
  const freeWeight = num(method.freeAboveWeightGrams, 0);
  const freeShipping =
    (freeThreshold > 0 && request.subtotalXof >= freeThreshold) ||
    (freeWeight > 0 && totals.weightGrams >= freeWeight);

  const freight = freeShipping ? 0 : Math.max(0, baseRateXof - discountXof) + handlingFeeXof;
  const total = freight + customsXof + insuranceXof + fragileXof;

  return {
    option: {
      methodId: method.id,
      methodCode: method.code,
      methodName: method.name,
      mode: method.mode,
      billable: !method.sampleRatesOnly,
      zoneCode: zone.code,
      zoneName: zone.name,
      billableBasis: basis,
      chargeableUnits: Math.round(units * 1000) / 1000,
      unit,
      actualWeightKg: Math.round(totals.actualWeightKg * 1000) / 1000,
      volumetricWeightKg: Math.round(volumetricKg * 1000) / 1000,
      volumeM3: Math.round(totals.volumeM3 * 10000) / 10000,
      baseRateXof: freeShipping ? 0 : baseRateXof,
      discountPercent: freeShipping ? 0 : discountPercent,
      discountXof: freeShipping ? 0 : discountXof,
      handlingFeeXof: freeShipping ? 0 : handlingFeeXof,
      customsXof,
      insuranceXof,
      fragileXof,
      freeShipping,
      totalXof: roundXof(total),
      transitDaysMin: Math.max(0, Math.trunc(num(rawRate.transitDaysMin, method.transitDaysMin))),
      transitDaysMax: Math.max(0, Math.trunc(num(rawRate.transitDaysMax, method.transitDaysMax))),
      deliveryTimeLabel: method.deliveryTimeLabel || `${method.transitDaysMin}–${method.transitDaysMax} jours`,
      rateLabel: (rawRate.label || "").trim() || `${effectiveRate.minimumBillableUnits}–${effectiveRate.maximumBillableUnits ?? "∞"} ${unit}`,
    },
  };
}

/**
 * Devis complet : résout la zone, interroge chaque transporteur, trie les options.
 * Tri : prix croissant, puis délai croissant (à prix égal, le plus rapide d'abord).
 */
export function quoteShippingOptions(methods: MethodInput[], zones: ZoneInput[], request: QuoteRequest): QuoteResponse {
  const packages = request.packages.filter((item) => item.quantity > 0);
  const totals = aggregatePackages(packages);
  const base: QuoteResponse = {
    available: false,
    zone: null,
    totals: {
      weightGrams: Math.round(totals.weightGrams),
      volumeCm3: Math.round(totals.volumeCm3),
      volumeM3: Math.round(totals.volumeM3 * 10000) / 10000,
      actualWeightKg: Math.round(totals.actualWeightKg * 1000) / 1000,
      packageCount: packages.length,
    },
    options: [],
    unavailable: [],
    cheapestMethodCode: null,
    fastestMethodCode: null,
    recommendedMode: null,
    sampleOnly: false,
  };
  if (!packages.length) return base;

  const forced = request.forcedZoneCode ? zones.find((zone) => zone.code === request.forcedZoneCode && !zone.deletedAt && zone.isActive) : null;
  const zone = forced ?? resolveZone(zones, request);
  if (!zone) return base;
  const withZone = { ...base, zone: { code: zone.code, name: zone.name } };

  const options: QuoteOption[] = [];
  const unavailable: UnavailableOption[] = [];
  for (const method of methods) {
    const result = quoteMethod(method, zone, { ...request, packages });
    if ("option" in result) options.push(result.option);
    else unavailable.push(result.unavailable);
  }

  options.sort((a, b) => a.totalXof - b.totalXof || a.transitDaysMax - b.transitDaysMax || a.methodCode.localeCompare(b.methodCode));
  if (!options.length) return { ...withZone, unavailable };

  const fastest = [...options].sort((a, b) => a.transitDaysMax - b.transitDaysMax || a.totalXof - b.totalXof)[0];
  const biddable = options.filter((option) => option.billable);
  return {
    ...withZone,
    available: true,
    options,
    unavailable,
    cheapestMethodCode: options[0].methodCode,
    fastestMethodCode: fastest.methodCode,
    recommendedMode: biddable.length ? biddable[0].mode : null,
    sampleOnly: biddable.length === 0,
  };
}

/** Empreinte stable d'un panier : mêmes lignes = même empreinte, ordre indifférent. */
export function cartFingerprint(lines: Array<{ productId: string; quantity: number }>): string {
  const normalized = lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.productId.toLowerCase()}x${Math.trunc(line.quantity)}`)
    .sort()
    .join("|");
  // FNV-1a 32 bits : suffisant pour une clé de corrélation, pas pour un secret.
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `cart_${hash.toString(16).padStart(8, "0")}`;
}
