import { describe, expect, it } from "vitest";
import {
  aggregatePackages,
  chargeableUnits,
  findRate,
  quoteShipping,
  recommendMode,
  roundXof,
  volumetricWeightKg,
  type CarrierConfig,
  type PackageInput,
  type RateRow,
} from "../lib/shipping-calc";

const airConfig: CarrierConfig = {
  mode: "air",
  volumetricDivisor: 6000,
  minimumBillableWeightKg: 0.5,
  minimumChargeXof: 0,
  outOfRangeBehavior: "disable",
};

const seaConfig: CarrierConfig = {
  mode: "sea",
  seaMinimumVolumeM3: 0.1,
  outOfRangeBehavior: "disable",
};

const airRates: RateRow[] = [
  { minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 12_000 },
  { minimumBillableUnits: 5.001, maximumBillableUnits: 20, rateXofPerUnit: 9_000 },
  { minimumBillableUnits: 20.001, maximumBillableUnits: null, rateXofPerUnit: 7_500 },
];

const seaRates: RateRow[] = [
  { minimumBillableUnits: 0.1, maximumBillableUnits: 1, rateXofPerUnit: 250_000 },
  { minimumBillableUnits: 1.001, maximumBillableUnits: null, rateXofPerUnit: 200_000 },
];

/** 30 × 20 × 10 cm, 500 g. */
const parcel: PackageInput = { lengthCm: 30, widthCm: 20, heightCm: 10, weightGrams: 500, quantity: 1 };

describe("volumétrie", () => {
  it("calcule le poids volumétrique à 6000", () => {
    // 30×20×10 = 6000 cm³ → 1 kg
    expect(volumetricWeightKg(6_000, 6000)).toBe(1);
  });

  it("agrège poids et volume sur plusieurs lignes", () => {
    const totals = aggregatePackages([parcel, { ...parcel, quantity: 3 }]);
    expect(totals.weightGrams).toBe(2_000);
    expect(totals.volumeM3).toBeCloseTo(0.024, 6);
  });
});

describe("avion", () => {
  it("retient le poids volumétrique quand il dépasse le poids réel", () => {
    const totals = aggregatePackages([parcel]);
    const result = chargeableUnits("air", airConfig, totals);
    expect(result.unit).toBe("kg");
    expect(result.units).toBe(1); // 1 kg volumétrique > 0,5 kg réel
  });

  it("applique le minimum facturable sous le poids réel", () => {
    const totals = aggregatePackages([{ ...parcel, weightGrams: 100 }]); // 0,1 kg réel, 1 kg vol.
    expect(chargeableUnits("air", airConfig, totals).units).toBe(1);
    const light = aggregatePackages([{ lengthCm: 1, widthCm: 1, heightCm: 1, weightGrams: 100, quantity: 1 }]);
    expect(chargeableUnits("air", airConfig, light).units).toBe(0.5); // minimum 0,5 kg
  });

  it("facture la tranche correspondante", () => {
    const quote = quoteShipping("air", airConfig, airRates, { packages: [{ ...parcel, quantity: 10 }], subtotalXof: 100_000 });
    expect(quote.available).toBe(true);
    if (!quote.available) return;
    // 10 kg volumétrique → tranche 5,001–20 à 9 000 XOF/kg
    expect(quote.breakdown.chargeableUnits).toBe(10);
    expect(quote.breakdown.baseRateXof).toBe(90_000);
  });
});

describe("bateau", () => {
  it("applique le minimum facturable de 0,1 m³", () => {
    const quote = quoteShipping("sea", seaConfig, seaRates, { packages: [{ ...parcel, quantity: 10 }], subtotalXof: 100_000 });
    expect(quote.available).toBe(true);
    if (!quote.available) return;
    // 0,06 m³ réels → 0,1 m³ facturés
    expect(quote.breakdown.volumeM3).toBeCloseTo(0.06, 4);
    expect(quote.breakdown.chargeableUnits).toBe(0.1);
    expect(quote.breakdown.baseRateXof).toBe(25_000);
  });

  it("retient le volume quand il dépasse le tonnage", () => {
    const bulky: PackageInput = { lengthCm: 100, widthCm: 100, heightCm: 25, weightGrams: 20_000, quantity: 1 };
    const totals = aggregatePackages([bulky]);
    // 0,25 m³ vs 0,02 t → 0,25 m³
    expect(chargeableUnits("sea", seaConfig, totals).units).toBeCloseTo(0.25, 6);
  });

  it("retient le tonnage quand il dépasse le volume", () => {
    const dense: PackageInput = { lengthCm: 10, widthCm: 10, heightCm: 10, weightGrams: 500_000, quantity: 1 };
    const totals = aggregatePackages([dense]);
    // 0,001 m³ vs 0,5 t → 0,5
    expect(chargeableUnits("sea", seaConfig, totals).units).toBe(0.5);
  });
});

describe("tranches", () => {
  it("trouve la tranche exacte", () => {
    expect(findRate(airRates, 3).rate?.rateXofPerUnit).toBe(12_000);
    expect(findRate(airRates, 10).rate?.rateXofPerUnit).toBe(9_000);
  });

  it("signale une valeur hors tranche", () => {
    const result = findRate([{ minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 1_000 }], 9);
    expect(result.outOfRange).toBe(true);
    expect(result.highest?.maximumBillableUnits).toBe(5);
  });

  it("désactive le transporteur hors tranche", () => {
    const quote = quoteShipping("air", airConfig, [{ minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 1_000 }], { packages: [{ ...parcel, quantity: 20 }], subtotalXof: 0 });
    expect(quote.available).toBe(false);
    if (quote.available) return;
    expect(quote.reason).toBe("out_of_range");
  });

  it("applique la tranche la plus haute si configuré", () => {
    const quote = quoteShipping(
      "air",
      { ...airConfig, outOfRangeBehavior: "use_highest" },
      [{ minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 1_000 }],
      { packages: [{ ...parcel, quantity: 20 }], subtotalXof: 0 },
    );
    expect(quote.available).toBe(true);
    if (!quote.available) return;
    expect(quote.breakdown.baseRateXof).toBe(20_000); // 20 kg × 1 000
  });
});

describe("surcharges et franchise", () => {
  it("ajoute assurance, dédouanement et colis fragile", () => {
    const quote = quoteShipping(
      "air",
      { ...airConfig, insurancePercent: 2, customsHandlingXof: 15_000, fragileSurchargeXof: 5_000 },
      airRates,
      { packages: [{ ...parcel, quantity: 10 }], subtotalXof: 1_000_000, isFragile: true },
    );
    expect(quote.available).toBe(true);
    if (!quote.available) return;
    expect(quote.breakdown.insuranceXof).toBe(20_000);
    expect(quote.breakdown.customsXof).toBe(15_000);
    expect(quote.breakdown.fragileXof).toBe(5_000);
    expect(quote.breakdown.totalXof).toBe(roundXof(90_000 + 20_000 + 15_000 + 5_000));
  });

  it("offre le transport au-delà du montant de franchise mais garde les surcharges", () => {
    const quote = quoteShipping(
      "air",
      { ...airConfig, freeAboveXof: 500_000, customsHandlingXof: 10_000 },
      airRates,
      { packages: [{ ...parcel, quantity: 10 }], subtotalXof: 600_000 },
    );
    expect(quote.available).toBe(true);
    if (!quote.available) return;
    expect(quote.breakdown.freeShipping).toBe(true);
    expect(quote.breakdown.baseRateXof).toBe(0);
    expect(quote.breakdown.totalXof).toBe(10_000);
  });

  it("n'offre pas le transport sous le seuil", () => {
    const quote = quoteShipping("air", { ...airConfig, freeAboveXof: 500_000 }, airRates, { packages: [{ ...parcel, quantity: 10 }], subtotalXof: 100_000 });
    if (!quote.available) throw new Error("devis attendu");
    expect(quote.breakdown.freeShipping).toBe(false);
    expect(quote.breakdown.totalXof).toBe(90_000);
  });

  it("refuse un envoi sans colis", () => {
    const quote = quoteShipping("air", airConfig, airRates, { packages: [], subtotalXof: 0 });
    expect(quote.available).toBe(false);
  });
});

describe("recommandation", () => {
  it("recommande l'avion pour un envoi léger", () => {
    expect(recommendMode(aggregatePackages([parcel])).recommended).toBe("air");
  });

  it("recommande le bateau dès le seuil de poids", () => {
    const heavy = aggregatePackages([{ ...parcel, weightGrams: 40_000 }]);
    expect(recommendMode(heavy).recommended).toBe("sea");
  });

  it("recommande le bateau dès le seuil de volume", () => {
    const bulky = aggregatePackages([{ lengthCm: 60, widthCm: 60, heightCm: 60, weightGrams: 5_000, quantity: 1 }]);
    expect(recommendMode(bulky).recommended).toBe("sea");
  });

  it("respecte des seuils personnalisés", () => {
    const totals = aggregatePackages([{ ...parcel, weightGrams: 10_000 }]);
    expect(recommendMode(totals, { seaFromWeightKg: 5 }).recommended).toBe("sea");
    expect(recommendMode(totals, { seaFromWeightKg: 50 }).recommended).toBe("air");
  });
});

describe("arrondi FCFA", () => {
  it("arrondit au multiple de 25", () => {
    expect(roundXof(1_012)).toBe(1_000);
    expect(roundXof(1_013)).toBe(1_025);
    expect(roundXof(90_000)).toBe(90_000);
  });
});
