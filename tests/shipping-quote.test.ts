import { describe, expect, it } from "vitest";
import {
  applicableDiscount,
  cartFingerprint,
  chargeableUnitsFor,
  effectiveBasis,
  quoteShippingOptions,
  resolveZone,
  usableRates,
  type MethodInput,
  type ZoneInput,
} from "../lib/shipping-quote";

const now = new Date("2026-06-15T10:00:00Z");

const abidjan: ZoneInput = { id: "z1", code: "CI_ABIDJAN", name: "Abidjan", countryCodes: ["CI"], isActive: true, sortOrder: 0 };
const interior: ZoneInput = { id: "z2", code: "CI_INTERIOR", name: "Intérieur", countryCodes: ["CI"], regionCodes: ["BOUAKE", "YAMOUSSOUKRO"], isActive: true, sortOrder: 1 };
const westAfrica: ZoneInput = { id: "z3", code: "WEST_AFRICA", name: "Afrique de l'Ouest", countryCodes: ["SN", "BJ"], isActive: true, sortOrder: 2 };


function airMethod(overrides: Partial<MethodInput> = {}): MethodInput {
  return {
    id: "m-air",
    code: "air",
    name: "Livraison par avion",
    mode: "air",
    isActive: true,
    sampleRatesOnly: false,
    volumetricDivisor: 6000,
    minimumBillableWeightKg: "0.5",
    minimumChargeXof: 0,
    transitDaysMin: 5,
    transitDaysMax: 10,
    rates: [
      { minimumBillableUnits: "0", maximumBillableUnits: "5", rateXofPerUnit: 9000 },
      { minimumBillableUnits: "5", maximumBillableUnits: "20", rateXofPerUnit: 8500 },
      { minimumBillableUnits: "20", maximumBillableUnits: null, rateXofPerUnit: 7000 },
    ],
    ...overrides,
  };
}

function seaMethod(overrides: Partial<MethodInput> = {}): MethodInput {
  return {
    id: "m-sea",
    code: "sea",
    name: "Bateau (groupage LCL)",
    mode: "sea",
    isActive: true,
    sampleRatesOnly: false,
    seaMinimumVolumeM3: "0.1",
    transitDaysMin: 35,
    transitDaysMax: 60,
    rates: [{ minimumBillableUnits: "0.1", maximumBillableUnits: null, rateXofPerUnit: 250000 }],
    ...overrides,
  };
}

const smallParcel = { lengthCm: 30, widthCm: 20, heightCm: 10, weightGrams: 1200, quantity: 1 };
const heavyParcel = { lengthCm: 60, widthCm: 50, heightCm: 40, weightGrams: 12000, quantity: 2 };

describe("resolveZone", () => {
  it("choisit la zone de la ville quand elle est renseignée", () => {
    const zones = [{ ...abidjan, cityNames: ["Abidjan", "Bingerville"] }, interior];
    expect(resolveZone(zones, { countryCode: "CI", city: "abidjan" })?.code).toBe("CI_ABIDJAN");
  });

  it("choisit la zone régionale quand la région correspond", () => {
    const zones: ZoneInput[] = [{ ...abidjan, regionCodes: ["ABIDJAN"] }, interior];
    expect(resolveZone(zones, { countryCode: "CI", regionCode: "bouake" })?.code).toBe("CI_INTERIOR");
  });

  it("la ville l'emporte sur la région", () => {
    const zones: ZoneInput[] = [
      { ...abidjan, cityNames: ["Bouaké"] },
      { ...interior, regionCodes: ["BOUAKE"] },
    ];
    expect(resolveZone(zones, { countryCode: "CI", regionCode: "BOUAKE", city: "Bouaké" })?.code).toBe("CI_ABIDJAN");
  });

  it("ignore une zone inactive ou supprimée", () => {
    const zones: ZoneInput[] = [{ ...abidjan, isActive: false }, { ...interior, deletedAt: new Date() }];
    expect(resolveZone(zones, { countryCode: "CI" })).toBeNull();
  });

  it("retombe sur la zone par défaut si le pays n'est couvert par aucune zone", () => {
    const fallback: ZoneInput = { id: "z9", code: "REST", name: "Reste du monde", countryCodes: [], isActive: true, isDefault: true };
    expect(resolveZone([abidjan, fallback], { countryCode: "FR" })?.code).toBe("REST");
  });

  it("ne renvoie rien quand aucun pays ne correspond et qu'il n'y a pas de défaut", () => {
    expect(resolveZone([abidjan], { countryCode: "FR" })).toBeNull();
  });

  it("couvre plusieurs pays d'une même zone", () => {
    expect(resolveZone([abidjan, westAfrica], { countryCode: "SN" })?.code).toBe("WEST_AFRICA");
    expect(resolveZone([abidjan, westAfrica], { countryCode: "bj" })?.code).toBe("WEST_AFRICA");
  });

  it("départage deux zones du même score par sortOrder", () => {
    const zones: ZoneInput[] = [{ ...abidjan, sortOrder: 5 }, { ...interior, sortOrder: 1, regionCodes: [] }];
    expect(resolveZone(zones, { countryCode: "CI" })?.code).toBe("CI_INTERIOR");
  });
});

describe("usableRates", () => {
  it("écarte les tranches inactives ou supprimées", () => {
    const rates = [
      { minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 100, isActive: false },
      { minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 100, deletedAt: new Date() },
      { minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 100 },
    ];
    expect(usableRates(rates, now)).toHaveLength(1);
  });

  it("respecte la fenêtre de validité", () => {
    const rates = [
      { minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 100, validFrom: new Date("2026-07-01") },
      { minimumBillableUnits: 0, maximumBillableUnits: 5, rateXofPerUnit: 100, validTo: new Date("2026-01-01") },
    ];
    expect(usableRates(rates, now)).toHaveLength(0);
  });
});

describe("effectiveBasis", () => {
  it("l'avion est facturé au poids par défaut", () => {
    expect(effectiveBasis({ mode: "air", billableBasis: null })).toBe("weight");
  });

  it("le bateau est facturé au volume par défaut", () => {
    expect(effectiveBasis({ mode: "sea", billableBasis: null })).toBe("volume");
  });

  it("une base explicite prime sur la convention", () => {
    expect(effectiveBasis({ mode: "air", billableBasis: "both" })).toBe("both");
  });
});

describe("chargeableUnitsFor", () => {
  it("avion : retient le poids volumétrique quand il dépasse le poids réel", () => {
    const method = airMethod();
    const totals = { weightGrams: 2000, volumeCm3: 60000, actualWeightKg: 2, volumeM3: 0.06 };
    const result = chargeableUnitsFor(method, "weight", totals);
    expect(result.units).toBe(10);
    expect(result.unit).toBe("kg");
  });

  it("avion : applique le minimum facturable", () => {
    const totals = { weightGrams: 100, volumeCm3: 600, actualWeightKg: 0.1, volumeM3: 0.0006 };
    expect(chargeableUnitsFor(airMethod(), "weight", totals).units).toBe(0.5);
  });

  it("bateau : retient le volume, jamais en dessous du minimum m³", () => {
    const totals = { weightGrams: 100000, volumeCm3: 200000, actualWeightKg: 100, volumeM3: 0.2 };
    expect(chargeableUnitsFor(seaMethod(), "volume", totals).units).toBe(0.2);
    const light = { weightGrams: 1000, volumeCm3: 1000, actualWeightKg: 1, volumeM3: 0.001 };
    expect(chargeableUnitsFor(seaMethod(), "volume", light).units).toBe(0.1);
  });

  it("bateau : les tonnes l'emportent sur un volume faible", () => {
    const totals = { weightGrams: 500000, volumeCm3: 100000, actualWeightKg: 500, volumeM3: 0.1 };
    expect(chargeableUnitsFor(seaMethod(), "volume", totals).units).toBe(0.5);
  });

  it("base mixte : retient la plus grande des deux valeurs", () => {
    const totals = { weightGrams: 2000, volumeCm3: 60000, actualWeightKg: 2, volumeM3: 0.06 };
    const both = chargeableUnitsFor(airMethod({ billableBasis: "both" }), "both", totals);
    expect(both.units).toBe(10);
    expect(both.unit).toBe("kg");
  });
});

describe("applicableDiscount", () => {
  it("retient le palier le plus élevé atteint", () => {
    const method = airMethod({ discounts: [
      { minimumBillableUnits: 10, discountPercent: 5 },
      { minimumBillableUnits: 50, discountPercent: 12 },
      { minimumBillableUnits: 100, discountPercent: 20 },
    ] });
    expect(Number(applicableDiscount(method, "CI_ABIDJAN", 60)?.discountPercent)).toBe(12);
  });

  it("ne renvoie rien sous le premier palier", () => {
    const method = airMethod({ discounts: [{ minimumBillableUnits: 10, discountPercent: 5 }] });
    expect(applicableDiscount(method, "CI_ABIDJAN", 9)).toBeNull();
  });

  it("ignore un palier désactivé", () => {
    const method = airMethod({ discounts: [{ minimumBillableUnits: 10, discountPercent: 5, isActive: false }] });
    expect(applicableDiscount(method, "CI_ABIDJAN", 50)).toBeNull();
  });
});

describe("quoteShippingOptions", () => {
  it("classe les options du moins cher au plus cher", () => {
    const response = quoteShippingOptions([airMethod(), seaMethod()], [abidjan], { countryCode: "CI", packages: [heavyParcel], subtotalXof: 500000, now });
    expect(response.available).toBe(true);
    expect(response.options).toHaveLength(2);
    expect(response.options[0].totalXof).toBeLessThanOrEqual(response.options[1].totalXof);
    expect(response.cheapestMethodCode).toBe(response.options[0].methodCode);
  });

  it("calcule le fret avion sur le poids volumétrique", () => {
    const response = quoteShippingOptions([airMethod()], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    const option = response.options[0];
    // 30×20×10 = 6000 cm³ → 1 kg volumétrique, mais 1,2 kg réels l'emportent.
    expect(option.chargeableUnits).toBe(1.2);
    expect(option.baseRateXof).toBe(Math.round(1.2 * 9000));
  });

  it("n'expose jamais une option pour un transporteur d'exemple comme facturable", () => {
    const response = quoteShippingOptions([airMethod({ sampleRatesOnly: true })], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.options[0].billable).toBe(false);
    expect(response.sampleOnly).toBe(true);
    expect(response.recommendedMode).toBeNull();
  });

  it("écarte un transporteur inactif en expliquant pourquoi", () => {
    const response = quoteShippingOptions([airMethod({ isActive: false }), seaMethod()], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.options.map((option) => option.methodCode)).toEqual(["sea"]);
    expect(response.unavailable[0].reason).toBe("inactive");
  });

  it("ne renvoie aucune option quand toutes les méthodes sont indisponibles", () => {
    const response = quoteShippingOptions([airMethod({ isActive: false })], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.available).toBe(false);
    expect(response.options).toHaveLength(0);
    expect(response.cheapestMethodCode).toBeNull();
  });

  it("respecte la préférence produit : bateau uniquement", () => {
    const response = quoteShippingOptions([airMethod(), seaMethod()], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, preference: "sea_only", now });
    expect(response.options.map((option) => option.mode)).toEqual(["sea"]);
    expect(response.unavailable.some((entry) => entry.reason === "mode_not_allowed")).toBe(true);
  });

  it("respecte la préférence produit : avion uniquement", () => {
    const response = quoteShippingOptions([airMethod(), seaMethod()], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, preference: "air_only", now });
    expect(response.options.every((option) => option.mode === "air")).toBe(true);
  });

  it("refuse un colis hors gabarit", () => {
    const response = quoteShippingOptions([airMethod({ maxPackageWeightGrams: 5000 })], [abidjan], { countryCode: "CI", packages: [heavyParcel], subtotalXof: 100000, now });
    expect(response.available).toBe(false);
    expect(response.unavailable[0].reason).toBe("package_too_large");
  });

  it("signale une quantité hors barème quand le dépassement est interdit", () => {
    // 2 × 12 kg = 24 kg : au-delà de la seule tranche 0–5 kg.
    const method = airMethod({ rates: [{ minimumBillableUnits: "0", maximumBillableUnits: "5", rateXofPerUnit: 9000 }], outOfRangeBehavior: "disable" });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [heavyParcel], subtotalXof: 100000, now });
    expect(response.available).toBe(false);
    expect(response.unavailable[0].reason).toBe("out_of_range");
  });

  it("applique la dernière tranche quand le dépassement est autorisé", () => {
    const method = airMethod({ rates: [{ minimumBillableUnits: "0", maximumBillableUnits: "5", rateXofPerUnit: 9000 }], outOfRangeBehavior: "use_highest" });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [heavyParcel], subtotalXof: 100000, now });
    expect(response.available).toBe(true);
    expect(response.options[0].totalXof).toBeGreaterThan(0);
  });

  it("applique le palier de remise au fret seulement", () => {
    const method = airMethod({ customsHandlingXof: 5000, discounts: [{ minimumBillableUnits: 1, discountPercent: 10 }] });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    const option = response.options[0];
    expect(option.discountXof).toBe(Math.round(option.baseRateXof * 0.1));
    expect(option.customsXof).toBe(5000);
  });

  it("offre le port au-delà du seuil mais conserve les frais de douane", () => {
    const method = airMethod({ freeAboveXof: 50000, customsHandlingXof: 3000 });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 80000, now });
    const option = response.options[0];
    expect(option.freeShipping).toBe(true);
    expect(option.baseRateXof).toBe(0);
    expect(option.discountXof).toBe(0);
    expect(option.totalXof).toBe(3000);
  });

  it("offre le port au-delà d'un seuil de poids", () => {
    const method = airMethod({ freeAboveWeightGrams: 2000 });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [heavyParcel], subtotalXof: 1000, now });
    expect(response.options[0].freeShipping).toBe(true);
  });

  it("ajoute les frais d'approche de la tranche", () => {
    const method = airMethod({ rates: [{ minimumBillableUnits: "0", maximumBillableUnits: "5", rateXofPerUnit: 9000, handlingFeeXof: 1500 }] });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.options[0].handlingFeeXof).toBe(1500);
    expect(response.options[0].totalXof).toBe(12300);
  });

  it("applique l'assurance et la surcharge fragile", () => {
    const method = airMethod({ insurancePercent: "1.5", fragileSurchargeXof: 2500 });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, isFragile: true, now });
    const option = response.options[0];
    expect(option.insuranceXof).toBe(1500);
    expect(option.fragileXof).toBe(2500);
  });

  it("arrondit tous les prix au multiple de 25 FCFA", () => {
    const method = airMethod({ rates: [{ minimumBillableUnits: "0", maximumBillableUnits: "5", rateXofPerUnit: 9001 }] });
    const response = quoteShippingOptions([method], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.options[0].totalXof % 25).toBe(0);
  });

  it("désigne l'option la plus rapide indépendamment du prix", () => {
    const fast = airMethod({ id: "m-fast", code: "air", transitDaysMin: 3, transitDaysMax: 4 });
    const slow = seaMethod({ transitDaysMin: 40, transitDaysMax: 70 });
    const response = quoteShippingOptions([fast, slow], [abidjan], { countryCode: "CI", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.fastestMethodCode).toBe("air");
    expect(response.recommendedMode).toBe("air");
  });

  it("ne produit rien sans colis", () => {
    const response = quoteShippingOptions([airMethod()], [abidjan], { countryCode: "CI", packages: [], subtotalXof: 0, now });
    expect(response.available).toBe(false);
    expect(response.options).toHaveLength(0);
  });

  it("ne produit rien sans zone de livraison", () => {
    const response = quoteShippingOptions([airMethod()], [abidjan], { countryCode: "FR", packages: [smallParcel], subtotalXof: 1000, now });
    expect(response.available).toBe(false);
    expect(response.zone).toBeNull();
  });

  it("force une zone pour l'usage interne", () => {
    const response = quoteShippingOptions([airMethod()], [abidjan, interior], { countryCode: "FR", forcedZoneCode: "CI_INTERIOR", packages: [smallParcel], subtotalXof: 100000, now });
    expect(response.zone?.code).toBe("CI_INTERIOR");
  });

  it("totalise le poids et le volume de toutes les lignes", () => {
    const response = quoteShippingOptions([airMethod()], [abidjan], { countryCode: "CI", packages: [smallParcel, heavyParcel], subtotalXof: 100000, now });
    expect(response.totals.weightGrams).toBe(1200 + 24000);
    expect(response.totals.packageCount).toBe(2);
  });

  it("ignore une quantité nulle ou négative", () => {
    const response = quoteShippingOptions([airMethod()], [abidjan], { countryCode: "CI", packages: [{ ...smallParcel, quantity: 0 }], subtotalXof: 100000, now });
    expect(response.available).toBe(false);
  });

  it("reste déterministe : deux appels identiques donnent le même résultat", () => {
    const run = () => quoteShippingOptions([airMethod(), seaMethod()], [abidjan], { countryCode: "CI", packages: [heavyParcel], subtotalXof: 500000, now });
    expect(run()).toEqual(run());
  });
});

describe("cartFingerprint", () => {
  it("est stable quel que soit l'ordre des lignes", () => {
    const a = cartFingerprint([{ productId: "b", quantity: 2 }, { productId: "a", quantity: 1 }]);
    const b = cartFingerprint([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }]);
    expect(a).toBe(b);
  });

  it("change quand une quantité change", () => {
    const a = cartFingerprint([{ productId: "a", quantity: 1 }]);
    const b = cartFingerprint([{ productId: "a", quantity: 2 }]);
    expect(a).not.toBe(b);
  });

  it("ignore les lignes à quantité nulle", () => {
    expect(cartFingerprint([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 0 }]))
      .toBe(cartFingerprint([{ productId: "a", quantity: 1 }]));
  });

  it("a un format prévisible", () => {
    expect(cartFingerprint([{ productId: "a", quantity: 1 }])).toMatch(/^cart_[0-9a-f]{8}$/);
  });
});
