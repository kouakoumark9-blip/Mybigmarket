import { describe, expect, it } from "vitest";

/**
 * Intl insère une espace fine insécable (U+202F) devant « FCFA » selon la
 * version d'ICU. Les comparaisons normalisent tous les blancs pour ne pas
 * dépendre de l'implémentation, tout en vérifiant bien la séparation.
 */
const normalize = (value: string) => value.replace(/[\s\u00a0\u202f]/g, " ");
import {
  estimatedDelivery,
  formatRange,
  formatRating,
  formatTierRange,
  formatXof,
  tierForQuantity,
} from "../components/product/b2b/format";

/**
 * Formatage et sélection de palier de la fiche produit.
 *
 * Ces fonctions décident de ce que l'acheteur voit en face d'un prix : une
 * erreur ici n'est pas cosmétique, elle annonce un tarif qui n'est pas celui
 * appliqué au panier. D'où des tests sur les bornes exactes.
 */

describe("formatXof", () => {
  it("sépare les milliers et colle l’unité", () => {
    // Espace insécable étroite ou insécable selon la version d'ICU.
    expect(normalize(formatXof(46172))).toBe("46 172 FCFA");
    expect(normalize(formatXof(0))).toBe("0 FCFA");
  });

  it("arrondit à l’unité, jamais de décimale affichée", () => {
    expect(normalize(formatXof(12500.4))).toBe("12 500 FCFA");
  });
});

describe("formatRange", () => {
  it("affiche un prix unique quand les paliers sont identiques", () => {
    expect(normalize(formatRange(12500, 12500))).toBe("12 500 FCFA");
  });

  it("abrège la seconde borne de l’unité", () => {
    expect(normalize(formatRange(15822, 22015))).toBe("15 822-22 015 FCFA");
  });
});

describe("formatTierRange", () => {
  it("formate une tranche fermée", () => {
    expect(normalize(formatTierRange(2, 19))).toBe("2-19 pièces");
  });

  it("passe au singulier pour une seule pièce", () => {
    expect(formatTierRange(1, 1)).toBe("1-1 pièce");
  });

  it("marque une tranche ouverte par ≥", () => {
    expect(normalize(formatTierRange(500, null))).toBe("≥ 500 pièces");
  });
});

describe("tierForQuantity", () => {
  const tiers = [
    { minimumQuantity: 2, maximumQuantity: 19, unitPriceXof: 15822 },
    { minimumQuantity: 20, maximumQuantity: 99, unitPriceXof: 14200 },
    { minimumQuantity: 100, maximumQuantity: null, unitPriceXof: 13100 },
  ];

  it("retient le palier dont le minimum est atteint", () => {
    expect(tierForQuantity(tiers, 19)?.unitPriceXof).toBe(15822);
    expect(tierForQuantity(tiers, 20)?.unitPriceXof).toBe(14200);
    expect(tierForQuantity(tiers, 5000)?.unitPriceXof).toBe(13100);
  });

  it("retombe sur le premier palier sous le minimum", () => {
    // Un prix indéfini serait pire qu'un prix au palier d'entrée.
    expect(tierForQuantity(tiers, 1)?.unitPriceXof).toBe(15822);
  });

  it("tolère des paliers non triés", () => {
    const shuffled = [tiers[2], tiers[0], tiers[1]];
    expect(tierForQuantity(shuffled, 50)?.unitPriceXof).toBe(14200);
  });

  it("renvoie null sans palier configuré", () => {
    expect(tierForQuantity([], 10)).toBeNull();
  });
});

describe("estimatedDelivery", () => {
  it("ajoute le délai à la date de référence", () => {
    const from = new Date("2026-03-01T10:00:00Z");
    expect(estimatedDelivery(9, from)).toBe("10 mars");
  });

  it("ne renvoie jamais une date passée", () => {
    const from = new Date("2026-03-01T10:00:00Z");
    expect(estimatedDelivery(-5, from)).toBe("1 mars");
  });
});

describe("formatRating", () => {
  it("utilise la virgule décimale française", () => {
    expect(formatRating(4.666)).toBe("4,7");
  });

  it("renvoie null sans note", () => {
    expect(formatRating(null)).toBeNull();
  });
});
