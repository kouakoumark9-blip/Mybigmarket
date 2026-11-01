/**
 * COPIE SYNCHRONISÉE de `lib/shipping-calc.ts` (racine du dépôt).
 * Voir `adminnew/lib/shipping-quote.ts` et `tests/shipping-quote-sync.test.ts`.
 */


export type ShippingMode = "air" | "sea";

export type CarrierConfig = {
  mode: ShippingMode;
  /** Diviseur volumétrique de l'avion (6000 par convention IATA). */
  volumetricDivisor?: number;
  /** Poids minimal facturable, en kg (avion). */
  minimumBillableWeightKg?: number | string | null;
  /** Volume minimal facturable, en m³ (bateau). */
  seaMinimumVolumeM3?: number | string | null;
  /** Franchise de port au-delà d'un sous-total : transport offert. */
  freeAboveXof?: number | null;
  /** Franchise de port au-delà d'un poids total. */
  freeAboveWeightGrams?: number | null;
  minimumChargeXof?: number | null;
  insurancePercent?: number | string | null;
  customsHandlingXof?: number | null;
  fragileSurchargeXof?: number | null;
  /** Comportement si la valeur taxable dépasse la dernière tranche. */
  outOfRangeBehavior?: "disable" | "use_highest";
};

export type RateRow = {
  minimumBillableUnits: number | string;
  maximumBillableUnits: number | string | null;
  rateXofPerUnit: number;
  minimumChargeXof?: number | null;
};

export type PackageInput = {
  /** Dimensions en centimètres. */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Poids unitaire en grammes. */
  weightGrams: number;
  quantity: number;
};

export type QuoteInput = {
  packages: PackageInput[];
  /** Sous-total produits HT, pour la franchise de port. */
  subtotalXof: number;
  /** Valeur déclarée pour l'assurance (défaut : sous-total). */
  declaredValueXof?: number;
  isFragile?: boolean;
};

export type QuoteBreakdown = {
  chargeableUnits: number;
  unit: "kg" | "m3";
  actualWeightKg: number;
  volumetricWeightKg: number;
  volumeM3: number;
  baseRateXof: number;
  insuranceXof: number;
  customsXof: number;
  fragileXof: number;
  freeShipping: boolean;
  totalXof: number;
};

export type QuoteResult =
  | { available: true; breakdown: QuoteBreakdown }
  | { available: false; reason: "no_rate" | "out_of_range" | "no_package" };

const num = (value: number | string | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Arrondi FCFA au multiple de 25 (pratique commerciale locale). */
export function roundXof(value: number, multiple = 25): number {
  if (!Number.isFinite(value)) return 0;
  if (multiple <= 1) return Math.round(value);
  return Math.round(value / multiple) * multiple;
}

/** Totaux physiques d'un envoi, toutes lignes confondues. */
export function aggregatePackages(packages: PackageInput[]) {
  let weightGrams = 0;
  let volumeCm3 = 0;
  for (const item of packages) {
    const qty = Math.max(0, Math.trunc(item.quantity));
    weightGrams += Math.max(0, item.weightGrams) * qty;
    volumeCm3 += Math.max(0, item.lengthCm) * Math.max(0, item.widthCm) * Math.max(0, item.heightCm) * qty;
  }
  return {
    weightGrams,
    volumeCm3,
    actualWeightKg: weightGrams / 1000,
    volumeM3: volumeCm3 / 1_000_000,
  };
}

/** Poids volumétrique avion en kg. */
export function volumetricWeightKg(volumeCm3: number, divisor = 6000): number {
  if (divisor <= 0) return 0;
  return volumeCm3 / divisor;
}

/** Valeur taxable selon le mode. */
export function chargeableUnits(mode: ShippingMode, config: CarrierConfig, totals: ReturnType<typeof aggregatePackages>) {
  if (mode === "air") {
    const volumetric = volumetricWeightKg(totals.volumeCm3, num(config.volumetricDivisor, 6000));
    const minimum = num(config.minimumBillableWeightKg, 0);
    const taxable = Math.max(totals.actualWeightKg, volumetric, minimum);
    return { units: taxable, unit: "kg" as const, volumetric: volumetric };
  }
  const minimumM3 = num(config.seaMinimumVolumeM3, 0.1);
  const tonnes = totals.actualWeightKg / 1000;
  const units = Math.max(totals.volumeM3, tonnes, minimumM3);
  return { units, unit: "m3" as const, volumetric: 0 };
}

/** Trouve la tranche correspondant à la valeur taxable. */
export function findRate(rates: RateRow[], units: number): { rate: RateRow | null; outOfRange: boolean; highest: RateRow | null } {
  const sorted = [...rates].sort((a, b) => num(a.minimumBillableUnits) - num(b.minimumBillableUnits));
  const highest = sorted.length ? sorted[sorted.length - 1] : null;
  const match = sorted.find((rate) => {
    const min = num(rate.minimumBillableUnits);
    const max = rate.maximumBillableUnits === null ? null : num(rate.maximumBillableUnits);
    return units >= min && (max === null || units <= max);
  });
  return { rate: match ?? null, outOfRange: !match, highest };
}

/**
 * Devis de transport complet : tranche + surcharges + franchise.
 * Renvoie `available: false` quand le transporteur ne doit pas être proposé.
 */
export function quoteShipping(mode: ShippingMode, config: CarrierConfig, rates: RateRow[], input: QuoteInput): QuoteResult {
  const packages = input.packages.filter((item) => item.quantity > 0);
  if (!packages.length) return { available: false, reason: "no_package" };

  const totals = aggregatePackages(packages);
  const { units, unit, volumetric } = chargeableUnits(mode, config, totals);

  const { rate, outOfRange, highest } = findRate(rates, units);
  let effectiveRate = rate;
  if (!effectiveRate) {
    const behavior = config.outOfRangeBehavior ?? "disable";
    if (behavior === "disable" || !highest) return { available: false, reason: outOfRange && highest ? "out_of_range" : "no_rate" };
    effectiveRate = highest;
  }

  const baseRateXof = Math.max(
    Math.round(units * effectiveRate.rateXofPerUnit),
    num(effectiveRate.minimumChargeXof ?? config.minimumChargeXof, 0),
  );

  const declaredValue = input.declaredValueXof ?? input.subtotalXof;
  const insuranceXof = Math.round((declaredValue * num(config.insurancePercent, 0)) / 100);
  const customsXof = Math.round(num(config.customsHandlingXof, 0));
  const fragileXof = input.isFragile ? Math.round(num(config.fragileSurchargeXof, 0)) : 0;

  const freeThreshold = config.freeAboveXof ?? null;
  const freeWeight = config.freeAboveWeightGrams ?? null;
  const freeShipping =
    (freeThreshold !== null && freeThreshold > 0 && input.subtotalXof >= freeThreshold) ||
    (freeWeight !== null && freeWeight > 0 && totals.weightGrams >= freeWeight);

  const total = (freeShipping ? 0 : baseRateXof) + insuranceXof + customsXof + fragileXof;

  return {
    available: true,
    breakdown: {
      chargeableUnits: Math.round(units * 1000) / 1000,
      unit,
      actualWeightKg: Math.round(totals.actualWeightKg * 1000) / 1000,
      volumetricWeightKg: Math.round(volumetric * 1000) / 1000,
      volumeM3: Math.round(totals.volumeM3 * 10000) / 10000,
      baseRateXof: freeShipping ? 0 : baseRateXof,
      insuranceXof,
      customsXof,
      fragileXof,
      freeShipping,
      totalXof: roundXof(total),
    },
  };
}

export type Recommendation = { recommended: ShippingMode; reason: string };

/**
 * Badge « Recommandé » : le bateau devient rentable au-delà d'un seuil de poids
 * ou de volume ; en dessous, l'avion reste plus rapide pour un coût comparable.
 * Seuils modifiables, valeurs par défaut alignées sur le seed existant.
 */
export function recommendMode(
  totals: ReturnType<typeof aggregatePackages>,
  thresholds: { seaFromWeightKg?: number; seaFromVolumeM3?: number } = {},
): Recommendation {
  const seaFromWeight = thresholds.seaFromWeightKg ?? 30;
  const seaFromVolume = thresholds.seaFromVolumeM3 ?? 0.1;
  if (totals.actualWeightKg >= seaFromWeight) return { recommended: "sea", reason: `Poids ≥ ${seaFromWeight} kg` };
  if (totals.volumeM3 >= seaFromVolume) return { recommended: "sea", reason: `Volume ≥ ${seaFromVolume} m³` };
  return { recommended: "air", reason: "Envoi léger et peu volumineux" };
}
