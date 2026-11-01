import { describe, expect, it } from "vitest";
import {
  applyStockMovement,
  availableStock,
  buildEan13,
  canSell,
  defaultCombination,
  generateCombinations,
  generateProductReference,
  isPubliclyVisible,
  isSearchable,
  isValidEan13,
  isValidIsbn,
  isValidUpc,
  packAvailableStock,
  slugifyProduct,
  validateBarcode,
} from "../lib/catalog-rules";

describe("codes-barres", () => {
  it("accepte un EAN13 valide", () => {
    // 4006381333931 est un EAN13 de référence.
    expect(isValidEan13("4006381333931")).toBe(true);
  });

  it("refuse une clé de contrôle erronée", () => {
    expect(isValidEan13("4006381333932")).toBe(false);
  });

  it("refuse une longueur incorrecte", () => {
    expect(isValidEan13("40063813339")).toBe(false);
    expect(isValidEan13("40063813339311")).toBe(false);
  });

  it("refuse les caractères non numériques", () => {
    expect(isValidEan13("40063813339A1")).toBe(false);
  });

  it("calcule l'EAN13 complet", () => {
    expect(buildEan13("400638133393")).toBe("4006381333931");
    expect(buildEan13("40063813339")).toBeNull();
  });

  it("valide un UPC-A", () => {
    expect(isValidUpc("036000291452")).toBe(true);
    expect(isValidUpc("036000291453")).toBe(false);
  });

  it("valide ISBN-13 et ISBN-10", () => {
    expect(isValidIsbn("978-3-16-148410-0")).toBe(true);
    expect(isValidIsbn("0-306-40615-2")).toBe(true);
    expect(isValidIsbn("0-306-40615-3")).toBe(false);
  });

  it("laisse un code-barres vide valide (champ facultatif)", () => {
    expect(validateBarcode("ean13", null)).toEqual({ valid: true });
    expect(validateBarcode("ean13", "")).toEqual({ valid: true });
  });

  it("renvoie un message par type", () => {
    expect(validateBarcode("ean13", "123").error).toContain("EAN13");
    expect(validateBarcode("upc", "123").error).toContain("UPC");
    expect(validateBarcode("isbn", "123").error).toContain("ISBN");
  });
});

describe("références et slugs", () => {
  it("génère une référence lisible et ordonnée", () => {
    expect(generateProductReference(2026, 123)).toBe("MBM-2026-000123");
  });

  it("produit un slug propre", () => {
    expect(slugifyProduct("Téléphone Camon 50 Pro")).toBe("telephone-camon-50-pro");
  });

  it("retire les accents et caractères spéciaux", () => {
    expect(slugifyProduct("Écouteurs sans fil — édition limitée !")).toBe("ecouteurs-sans-fil-edition-limitee");
  });

  it("ne renvoie jamais un slug vide", () => {
    expect(slugifyProduct("!!!")).toBe("produit");
  });

  it("borne la longueur sans finir par un tiret", () => {
    const slug = slugifyProduct("a".repeat(200), 10);
    expect(slug.length).toBeLessThanOrEqual(10);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("générateur de combinaisons", () => {
  it("produit le produit cartésien", () => {
    const result = generateCombinations([
      { code: "couleur", values: [{ code: "noir" }, { code: "blanc" }] },
      { code: "taille", values: [{ code: "m" }, { code: "l" }, { code: "xl" }] },
    ]);
    expect(result).toHaveLength(6);
  });

  it("génère des clés uniques", () => {
    const result = generateCombinations([
      { code: "couleur", values: [{ code: "noir" }, { code: "blanc" }] },
      { code: "taille", values: [{ code: "m" }, { code: "l" }] },
    ]);
    expect(new Set(result.map((item) => item.key)).size).toBe(result.length);
  });

  it("produit une clé stable quel que soit l'ordre des groupes", () => {
    const a = generateCombinations([
      { code: "taille", values: [{ code: "m" }] },
      { code: "couleur", values: [{ code: "noir" }] },
    ]);
    const b = generateCombinations([
      { code: "couleur", values: [{ code: "noir" }] },
      { code: "taille", values: [{ code: "m" }] },
    ]);
    expect(a[0].key).toBe(b[0].key);
  });

  it("ignore les doublons de valeurs", () => {
    const result = generateCombinations([{ code: "couleur", values: [{ code: "noir" }, { code: "noir" }] }]);
    expect(result).toHaveLength(1);
  });

  it("renvoie un tableau vide sans attribut", () => {
    expect(generateCombinations([])).toEqual([]);
    expect(generateCombinations([{ code: "couleur", values: [] }])).toEqual([]);
  });

  it("refuse une génération déraisonnable", () => {
    expect(() =>
      generateCombinations(
        [
          { code: "a", values: Array.from({ length: 10 }, (_, i) => ({ code: `v${i}` })) },
          { code: "b", values: Array.from({ length: 10 }, (_, i) => ({ code: `v${i}` })) },
          { code: "c", values: Array.from({ length: 10 }, (_, i) => ({ code: `v${i}` })) },
        ],
        500,
      ),
    ).toThrow(/Trop de combinaisons/);
  });

  it("construit un libellé lisible", () => {
    const result = generateCombinations([
      { code: "couleur", values: [{ code: "noir" }] },
      { code: "taille", values: [{ code: "xl" }] },
    ]);
    expect(result[0].label).toBe("noir / xl");
  });
});

describe("stock", () => {
  it("calcule le disponible", () => {
    expect(availableStock({ quantity: 10, reserved: 3 })).toBe(7);
    expect(availableStock({ quantity: 2, reserved: 5 })).toBe(0);
  });

  it("limite le pack au composant le plus rare", () => {
    expect(packAvailableStock([{ quantity: 10, requiredQuantity: 2 }, { quantity: 3, requiredQuantity: 1 }])).toBe(3);
  });

  it("tient compte du stock réservé des composants", () => {
    expect(packAvailableStock([{ quantity: 10, reserved: 9, requiredQuantity: 1 }])).toBe(1);
  });

  it("renvoie 0 pour un pack sans composant", () => {
    expect(packAvailableStock([])).toBe(0);
  });
});

describe("décision de vente", () => {
  it("autorise quand le stock suffit", () => {
    expect(canSell({ available: 5, requested: 2 })).toEqual({ sellable: true });
  });

  it("refuse à rupture avec le comportement par défaut", () => {
    expect(canSell({ available: 0, requested: 1 })).toEqual({ sellable: false, reason: "out_of_stock" });
  });

  it("autorise la précommande", () => {
    expect(canSell({ available: 0, requested: 1, behavior: "backorder" })).toEqual({ sellable: true });
  });

  it("hérite du comportement global quand le produit ne décide pas", () => {
    expect(canSell({ available: 0, requested: 1, behavior: "use_default", defaultBehavior: "backorder" })).toEqual({ sellable: true });
  });

  it("bloque un produit non commandable", () => {
    expect(canSell({ available: 100, requested: 1, availableForOrder: false })).toEqual({ sellable: false, reason: "not_available" });
  });

  it("applique le MOQ", () => {
    expect(canSell({ available: 100, requested: 4, minimumQuantity: 5 })).toEqual({ sellable: false, reason: "below_minimum" });
  });

  it("refuse une quantité sous le MOQ même en précommande", () => {
    expect(canSell({ available: 0, requested: 2, minimumQuantity: 10, behavior: "backorder" }).sellable).toBe(false);
  });
});

describe("mouvements de stock", () => {
  it("calcule avant/après", () => {
    expect(applyStockMovement(10, -3)).toEqual({ before: 10, after: 7, delta: -3 });
  });

  it("refuse un mouvement qui rend le stock négatif", () => {
    expect(() => applyStockMovement(2, -5)).toThrow(/Stock insuffisant/);
  });

  it("autorise le négatif quand explicitement permis", () => {
    expect(applyStockMovement(2, -5, true).after).toBe(-3);
  });
});

describe("visibilité", () => {
  const approved = { visibility: "everywhere", isActive: true, status: "approved", deletedAt: null };

  it("rend visible un produit approuvé et actif", () => {
    expect(isPubliclyVisible(approved)).toBe(true);
  });

  it("masque un produit supprimé (corbeille)", () => {
    expect(isPubliclyVisible({ ...approved, deletedAt: new Date() })).toBe(false);
  });

  it("masque un produit désactivé", () => {
    expect(isPubliclyVisible({ ...approved, isActive: false })).toBe(false);
  });

  it("masque un produit non approuvé", () => {
    expect(isPubliclyVisible({ ...approved, status: "pending_review" })).toBe(false);
  });

  it("masque un produit en visibilité nulle part", () => {
    expect(isPubliclyVisible({ ...approved, visibility: "nowhere" })).toBe(false);
  });

  it("rend un produit « catalogue seul » visible mais non cherchable", () => {
    const catalogOnly = { ...approved, visibility: "catalog" };
    expect(isPubliclyVisible(catalogOnly)).toBe(true);
    expect(isSearchable(catalogOnly)).toBe(false);
  });

  it("rend cherchable un produit « recherche seule »", () => {
    expect(isSearchable({ ...approved, visibility: "search" })).toBe(true);
  });
});

describe("combinaison par défaut", () => {
  it("retient la combinaison marquée", () => {
    expect(defaultCombination([{ isDefault: false }, { isDefault: true }])).toEqual({ isDefault: true });
  });

  it("retombe sur la première", () => {
    expect(defaultCombination([{ isDefault: false }, { isDefault: false }])).toEqual({ isDefault: false });
  });

  it("renvoie null sans combinaison", () => {
    expect(defaultCombination([])).toBeNull();
  });
});
