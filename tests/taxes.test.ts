import { describe, expect, it } from "vitest";
import {
  convertXof,
  priceIncludingTax,
  resolveTaxRate,
  taxFromPriceIncluding,
  type TaxRule,
} from "../lib/taxes";

const rules: TaxRule[] = [
  { id: "ci-standard", countryCode: "CI", ratePercent: 18, isActive: true },
  { id: "sn-standard", countryCode: "SN", ratePercent: 18, isActive: true },
  { id: "gh-standard", countryCode: "GH", ratePercent: 15, isActive: true },
  { id: "bj-exempt", countryCode: "BJ", ratePercent: 0, isActive: true },
  { id: "ci-old", countryCode: "CI", ratePercent: 9, isActive: false },
  { id: "sn-dakar", countryCode: "SN", region: "Dakar", ratePercent: 20, isActive: true },
];

describe("résolution du taux", () => {
  it("applique le taux du pays de livraison", () => {
    expect(resolveTaxRate(rules, { countryCode: "CI" }).ratePercent).toBe(18);
    expect(resolveTaxRate(rules, { countryCode: "GH" }).ratePercent).toBe(15);
  });

  it("ignore une règle inactive", () => {
    const resolved = resolveTaxRate(rules, { countryCode: "CI" });
    expect(resolved.ruleId).toBe("ci-standard");
    expect(resolved.ratePercent).toBe(18);
  });

  it("fait primer la règle régionale sur la règle nationale", () => {
    expect(resolveTaxRate(rules, { countryCode: "SN", region: "Dakar" }).ratePercent).toBe(20);
  });

  it("retombe sur la règle nationale hors région connue", () => {
    expect(resolveTaxRate(rules, { countryCode: "SN", region: "Thiès" }).ratePercent).toBe(18);
  });

  it("respecte un taux zéro explicite", () => {
    const resolved = resolveTaxRate(rules, { countryCode: "BJ" });
    expect(resolved.ratePercent).toBe(0);
    expect(resolved.fallback).toBe(false);
    expect(resolved.ruleId).toBe("bj-exempt");
  });

  it("signale explicitement l'absence de règle", () => {
    const resolved = resolveTaxRate(rules, { countryCode: "FR" });
    expect(resolved.fallback).toBe(true);
    expect(resolved.ratePercent).toBe(0);
  });

  it("est insensible à la casse du pays", () => {
    expect(resolveTaxRate(rules, { countryCode: "ci" }).ratePercent).toBe(18);
  });

  it("arbitre par priorité entre deux règles nationales", () => {
    const withPriority: TaxRule[] = [
      { id: "a", countryCode: "CI", ratePercent: 10, priority: 1 },
      { id: "b", countryCode: "CI", ratePercent: 18, priority: 5 },
    ];
    expect(resolveTaxRate(withPriority, { countryCode: "CI" }).ruleId).toBe("b");
  });
});

describe("calcul TTC", () => {
  it("applique 18 %", () => {
    expect(priceIncludingTax(10_000, 18)).toBe(11_800);
  });

  it("renvoie le HT avec un taux nul", () => {
    expect(priceIncludingTax(10_000, 0)).toBe(10_000);
  });

  it("arrondit au franc", () => {
    expect(priceIncludingTax(9_995, 18)).toBe(11_794);
  });

  it("extrait la taxe d'un prix TTC", () => {
    expect(taxFromPriceIncluding(11_800, 18)).toBe(1_800);
    expect(taxFromPriceIncluding(10_000, 0)).toBe(0);
  });

  it("est réversible HT → TTC → taxe", () => {
    const ttc = priceIncludingTax(12_345, 18);
    const tax = taxFromPriceIncluding(ttc, 18);
    expect(ttc - tax).toBeCloseTo(12_345, 0);
  });
});

describe("devises", () => {
  it("convertit en devise secondaire arrondie", () => {
    expect(convertXof(10_000, 0.001524, 2)).toBe(15.24);
  });

  it("laisse le montant intact si le taux est invalide", () => {
    expect(convertXof(10_000, 0)).toBe(10_000);
    expect(convertXof(10_000, Number.NaN)).toBe(10_000);
  });

  it("gère les devises sans décimale", () => {
    expect(convertXof(1_000, 1.5, 0)).toBe(1_500);
  });
});

describe("règle inter-pays", () => {
  it("produit assujetti : TTC différent selon le pays", () => {
    const priceHt = 50_000;
    const ci = resolveTaxRate(rules, { countryCode: "CI" });
    const gh = resolveTaxRate(rules, { countryCode: "GH" });
    expect(priceIncludingTax(priceHt, ci.ratePercent)).toBe(59_000);
    expect(priceIncludingTax(priceHt, gh.ratePercent)).toBe(57_500);
  });

  it("destination exonérée : TTC = HT", () => {
    const bj = resolveTaxRate(rules, { countryCode: "BJ" });
    expect(priceIncludingTax(50_000, bj.ratePercent)).toBe(50_000);
  });
});
