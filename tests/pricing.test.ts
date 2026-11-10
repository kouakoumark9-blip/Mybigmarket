import { describe, expect, it } from "vitest";
import {
  bestTier,
  computeTaxAmount,
  computeTaxIncluded,
  computeUnitPrice,
  isSpecificPriceApplicable,
  type PriceContext,
} from "../lib/pricing";

const base: PriceContext = { basePriceXof: 10_000, quantity: 1, purchasePriceXof: 4_000 };

describe("paliers dégressifs", () => {
  const tiers = [
    { minimumQuantity: 1, maximumQuantity: 9, unitPriceXof: 10_000 },
    { minimumQuantity: 10, maximumQuantity: 49, unitPriceXof: 9_000 },
    { minimumQuantity: 50, maximumQuantity: null, unitPriceXof: 8_000 },
  ];

  it("retient le prix catalogue sous le premier palier", () => {
    expect(bestTier(tiers, 9)?.unitPriceXof).toBe(10_000);
  });

  it("applique le palier à partir de la quantité minimale", () => {
    expect(computeUnitPrice({ ...base, quantity: 10, tiers }).unitPriceXof).toBe(9_000);
  });

  it("applique le dernier palier sans borne haute", () => {
    expect(computeUnitPrice({ ...base, quantity: 500, tiers }).unitPriceXof).toBe(8_000);
  });

  it("ignore le palier quand aucun ne correspond", () => {
    expect(bestTier([{ minimumQuantity: 10, maximumQuantity: null, unitPriceXof: 9_000 }], 3)).toBeNull();
  });
});

describe("remise groupe", () => {
  it("applique 5 % au prix de base", () => {
    const result = computeUnitPrice({ ...base, quantity: 1, groupDiscountBasisPoints: 500 });
    expect(result.groupDiscountXof).toBe(500);
    expect(result.unitPriceXof).toBe(9_500);
  });

  it("s'applique APRÈS le palier, pas sur le prix catalogue", () => {
    const tiers = [{ minimumQuantity: 10, maximumQuantity: null, unitPriceXof: 9_000 }];
    const result = computeUnitPrice({ ...base, quantity: 10, tiers, groupDiscountBasisPoints: 500 });
    expect(result.unitPriceXof).toBe(8_550); // 9000 - 5 %
  });
});

describe("prix spécifiques", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("rejette une règle hors période", () => {
    const rule = { discountType: "percent" as const, discountValue: 10, dateTo: new Date("2026-06-01T00:00:00Z") };
    expect(isSpecificPriceApplicable(rule, { ...base, now })).toBe(false);
  });

  it("rejette une règle sous la quantité minimale", () => {
    const rule = { discountType: "percent" as const, discountValue: 10, minimumQuantity: 5 };
    expect(isSpecificPriceApplicable(rule, { ...base, quantity: 4, now })).toBe(false);
  });

  it("applique un pourcentage", () => {
    const result = computeUnitPrice({ ...base, quantity: 1, now, specificPrices: [{ discountType: "percent", discountValue: 10 }] });
    expect(result.specificDiscountXof).toBe(1_000);
    expect(result.unitPriceXof).toBe(9_000);
  });

  it("applique un montant fixe sans passer sous zéro", () => {
    const result = computeUnitPrice({ ...base, quantity: 1, now, specificPrices: [{ discountType: "amount", discountValue: 50_000 }] });
    expect(result.unitPriceXof).toBeGreaterThanOrEqual(0);
  });

  it("retient la règle la plus favorable au client", () => {
    const result = computeUnitPrice({
      ...base,
      quantity: 1,
      now,
      specificPrices: [
        { discountType: "percent", discountValue: 10 },
        { discountType: "percent", discountValue: 25 },
      ],
    });
    expect(result.unitPriceXof).toBe(7_500);
  });

  it("ne fait jamais payer plus cher à cause d'une règle ciblée moins avantageuse", () => {
    const result = computeUnitPrice({
      ...base,
      quantity: 1,
      now,
      customer: { customerId: "buyer-1" },
      specificPrices: [
        { discountType: "percent", discountValue: 40 }, // globale, plus forte
        { customerId: "buyer-1", discountType: "percent", discountValue: 5 }, // ciblée, plus faible
      ],
    });
    // La remise la plus forte s'applique : 10 000 − 40 % = 6 000.
    expect(result.specificRuleApplied).toBe(true);
    expect(result.unitPriceXof).toBe(6_000);
  });

  it("retient la règle la plus spécifique à remise égale", () => {
    const result = computeUnitPrice({
      ...base,
      quantity: 1,
      now,
      customer: { customerId: "buyer-1" },
      specificPrices: [
        { discountType: "percent", discountValue: 10 },
        { customerId: "buyer-1", discountType: "percent", discountValue: 10 },
      ],
    });
    // Même remise : le prix est identique, seule la règle retenue change.
    expect(result.unitPriceXof).toBe(9_000);
    expect(result.specificDiscountXof).toBe(1_000);
  });
});

describe("plancher prix d'achat", () => {
  it("ne descend jamais sous le prix d'achat", () => {
    const result = computeUnitPrice({ basePriceXof: 5_000, quantity: 1, purchasePriceXof: 4_500, specificPrices: [{ discountType: "percent", discountValue: 50 }] });
    expect(result.unitPriceXof).toBe(4_500);
    expect(result.floorApplied).toBe(true);
  });

  it("signale une marge nulle quand le plancher s'applique", () => {
    const result = computeUnitPrice({ basePriceXof: 5_000, quantity: 1, purchasePriceXof: 4_500, groupDiscountBasisPoints: 2_000 });
    expect(result.marginXof).toBe(0);
  });
});

describe("éco-taxe et total", () => {
  it("ajoute l'éco-taxe au prix unitaire et la répercute sur le total", () => {
    const result = computeUnitPrice({ ...base, quantity: 3, ecotaxXof: 250 });
    expect(result.unitPriceXof).toBe(10_250);
    expect(result.totalPriceXof).toBe(30_750);
  });
});

describe("marge", () => {
  it("calcule la marge en valeur et en pourcentage", () => {
    const result = computeUnitPrice({ basePriceXof: 10_000, quantity: 1, purchasePriceXof: 4_000 });
    expect(result.marginXof).toBe(6_000);
    expect(result.marginPercent).toBe(60);
  });

  it("ne calcule pas de marge sans prix d'achat", () => {
    const result = computeUnitPrice({ basePriceXof: 10_000, quantity: 1, purchasePriceXof: null });
    expect(result.marginXof).toBeNull();
  });
});

describe("taxes", () => {
  it("calcule le TTC à 18 %", () => {
    expect(computeTaxIncluded(10_000, 18)).toBe(11_800);
    expect(computeTaxAmount(10_000, 18)).toBe(1_800);
  });

  it("renvoie le HT quand le taux est nul", () => {
    expect(computeTaxIncluded(10_000, 0)).toBe(10_000);
    expect(computeTaxAmount(10_000, 0)).toBe(0);
  });
});

describe("non-cumul palier + promo", () => {
  it("la promo porte sur le prix du palier, pas sur le prix catalogue", () => {
    const tiers = [{ minimumQuantity: 10, maximumQuantity: null, unitPriceXof: 9_000 }];
    const result = computeUnitPrice({ ...base, quantity: 10, tiers, specificPrices: [{ discountType: "percent", discountValue: 10 }] });
    // 9 000 (palier) − 10 % = 8 100, et non 10 000 − 10 % = 9 000
    expect(result.unitPriceXof).toBe(8_100);
  });
});

describe("prix fixe spécifique", () => {
  it("remplace le prix courant sans jamais le dépasser", async () => {
    const { computeUnitPrice } = await import("@/lib/pricing");
    const lower = computeUnitPrice({ basePriceXof: 10_000, quantity: 1, specificPrices: [{ id: "sp1", source: "specific_price", discountType: "fixed_price", discountValue: 8_000 }] });
    expect(lower).toMatchObject({ unitPriceXof: 8_000, specificDiscountXof: 2_000, specificRuleApplied: true });
    expect(lower.appliedRule?.id).toBe("sp1");
    const higher = computeUnitPrice({ basePriceXof: 10_000, quantity: 1, specificPrices: [{ discountType: "fixed_price", discountValue: 12_000 }] });
    expect(higher).toMatchObject({ unitPriceXof: 10_000, specificRuleApplied: false, appliedRule: null });
  });
});
