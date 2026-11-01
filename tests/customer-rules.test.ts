import { describe, expect, it } from "vitest";
import {
  addressSignature,
  anonymizedIdentity,
  applyDiscountBasisPoints,
  bestGroupDiscount,
  canAnonymizeCustomer,
  customerSegment,
  groupDiscountBasisPoints,
  isCartAbandoned,
  isValidEmail,
  isValidPhone,
  isValidTaxNumber,
  maskEmail,
  mergeCarts,
  normalizeEmail,
  normalizePhone,
  normalizeQuantity,
  summarizeCart,
  validateAddress,
} from "../lib/customer-rules";

const validAddress = {
  firstName: "Awa",
  lastName: "Traoré",
  phone: "+225 07 12 34 56 78",
  line1: "Cocody Riviera 3, rue des Jardins",
  city: "Abidjan",
  countryCode: " ci ",
};

describe("validateAddress", () => {
  it("accepte une adresse complète et normalise le pays", () => {
    const result = validateAddress(validAddress);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.countryCode).toBe("CI");
      expect(result.value.label).toBe("Adresse");
      expect(result.value.line2).toBeNull();
    }
  });

  it("refuse un téléphone trop court", () => {
    const result = validateAddress({ ...validAddress, phone: "07 12" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.some((issue) => issue.field === "phone")).toBe(true);
  });

  it("refuse une adresse sans rue", () => {
    const result = validateAddress({ ...validAddress, line1: "  " });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((issue) => issue.field)).toContain("line1");
  });

  it("refuse un code pays mal formé", () => {
    const result = validateAddress({ ...validAddress, countryCode: "CIV" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.map((issue) => issue.field)).toContain("countryCode");
  });

  it("refuse un code postal avec des caractères interdits", () => {
    const result = validateAddress({ ...validAddress, postalCode: "!!!" });
    expect(result.valid).toBe(false);
  });

  it("cumule les erreurs au lieu de s'arrêter à la première", () => {
    const result = validateAddress({ countryCode: "", phone: "", line1: "", city: "", firstName: "", lastName: "" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues.length).toBeGreaterThanOrEqual(5);
  });

  it("conserve les indicateurs par défaut", () => {
    const result = validateAddress({ ...validAddress, isDefaultShipping: true, isDefaultBilling: true });
    if (result.valid) {
      expect(result.value.isDefaultShipping).toBe(true);
      expect(result.value.isDefaultBilling).toBe(true);
    }
  });
});

describe("téléphone et e-mail", () => {
  it("normalise un numéro écrit avec des espaces ou des tirets", () => {
    expect(normalizePhone("+225 07-12-34-56-78")).toBe("+2250712345678");
    expect(normalizePhone("07.12.34.56.78")).toBe("0712345678");
  });

  it("accepte les longueurs E.164 et refuse le reste", () => {
    expect(isValidPhone("+2250712345678")).toBe(true);
    expect(isValidPhone("1234567")).toBe(false);
    expect(isValidPhone("1234567890123456")).toBe(false);
    expect(isValidPhone("abcdefgh")).toBe(false);
  });

  it("normalise et valide les e-mails", () => {
    expect(normalizeEmail("  AWA@Example.COM ")).toBe("awa@example.com");
    expect(isValidEmail("awa@example.com")).toBe(true);
    expect(isValidEmail("awa@localhost")).toBe(false);
    expect(isValidEmail("awa example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("masque l'e-mail en gardant le domaine", () => {
    expect(maskEmail("awa.traore@example.com")).toBe("aw********@example.com");
    expect(maskEmail("invalid")).toBe("");
  });
});

describe("addressSignature", () => {
  it("ignore la casse et les espaces superflus", () => {
    const a = addressSignature(validAddress);
    const b = addressSignature({ ...validAddress, firstName: "  AWA ", city: "ABIDJAN", phone: "+2250712345678" });
    expect(a).toBe(b);
  });

  it("distingue deux adresses réellement différentes", () => {
    expect(addressSignature(validAddress)).not.toBe(addressSignature({ ...validAddress, line1: "Yopougon" }));
  });
});

describe("segment client", () => {
  it("est professionnel seulement avec raison sociale ET numéro fiscal", () => {
    expect(customerSegment({ companyName: "Sahel SARL", taxNumber: "CI-123" })).toBe("business");
    expect(customerSegment({ companyName: "Sahel SARL" })).toBe("individual");
    expect(customerSegment({})).toBe("individual");
  });

  it("valide un numéro fiscal plausible", () => {
    expect(isValidTaxNumber("CI-1234567 A")).toBe(true);
    expect(isValidTaxNumber("  ")).toBe(false);
    expect(isValidTaxNumber("!!")).toBe(false);
  });
});

describe("remises de groupe", () => {
  it("exprime la remise en points de base bornés", () => {
    expect(groupDiscountBasisPoints({ discountBasisPoints: 500 })).toBe(500);
    expect(groupDiscountBasisPoints({ discountBasisPoints: 20_000 })).toBe(10_000);
    expect(groupDiscountBasisPoints({ discountBasisPoints: -50 })).toBe(0);
  });

  it("n'applique aucune remise sur un groupe inactif", () => {
    expect(groupDiscountBasisPoints({ discountBasisPoints: 1_500, isActive: false })).toBe(0);
  });

  it("applique 5 % sur 10 000 FCFA", () => {
    expect(applyDiscountBasisPoints(10_000, 500)).toBe(9_500);
    expect(applyDiscountBasisPoints(10_000, 0)).toBe(10_000);
    expect(applyDiscountBasisPoints(10_000, 10_000)).toBe(0);
  });

  it("ne cumule pas deux groupes : la remise la plus forte gagne", () => {
    expect(bestGroupDiscount([{ discountBasisPoints: 300 }, { discountBasisPoints: 800 }, { discountBasisPoints: 100 }])).toBe(800);
    expect(bestGroupDiscount([])).toBe(0);
  });
});

describe("normalizeQuantity", () => {
  it("laisse passer une quantité valide", () => {
    expect(normalizeQuantity(5)).toEqual({ ok: true, quantity: 5, adjusted: false });
  });

  it("remonte au minimum de commande", () => {
    expect(normalizeQuantity(2, { minimumQuantity: 10 })).toEqual({ ok: true, quantity: 10, adjusted: true });
  });

  it("arrondit au pas de commande supérieur", () => {
    expect(normalizeQuantity(7, { quantityStep: 5 })).toEqual({ ok: true, quantity: 10, adjusted: true });
  });

  it("combine pas et minimum en restant multiple du pas", () => {
    const result = normalizeQuantity(1, { minimumQuantity: 7, quantityStep: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quantity % 5).toBe(0);
  });

  it("refuse une quantité nulle ou négative", () => {
    expect(normalizeQuantity(0).ok).toBe(false);
    expect(normalizeQuantity(-3).ok).toBe(false);
  });

  it("refuse au-delà du plafond de ligne", () => {
    expect(normalizeQuantity(20_000)).toEqual({ ok: false, reason: "above_maximum", quantity: 10_000 });
  });

  it("refuse un article en rupture", () => {
    expect(normalizeQuantity(1, { available: 0 })).toEqual({ ok: false, reason: "not_sellable", quantity: 0 });
  });

  it("plafonne au stock disponible, en respectant le pas", () => {
    const result = normalizeQuantity(10, { available: 7, quantityStep: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.quantity).toBe(5);
  });

  it("accepte exactement le stock disponible", () => {
    expect(normalizeQuantity(7, { available: 7 })).toEqual({ ok: true, quantity: 7, adjusted: false });
  });
});

describe("summarizeCart", () => {
  const lines = [
    { productId: "a", quantity: 2, unitPriceXof: 1000, weightGrams: 500, lengthCm: 10, widthCm: 10, heightCm: 10 },
    { productId: "b", quantity: 1, unitPriceXof: 2500, weightGrams: 2000, lengthCm: 20, widthCm: 20, heightCm: 20 },
  ];

  it("totalise montants, poids et volume", () => {
    const summary = summarizeCart(lines);
    expect(summary.subtotalXof).toBe(2000 + 2500);
    expect(summary.itemCount).toBe(3);
    expect(summary.weightGrams).toBe(1000 + 2000);
    expect(summary.volumeCm3).toBe(2 * 1000 + 8000);
  });

  it("signale les lignes non commandables sans casser le total", () => {
    const summary = summarizeCart([...lines, { productId: "c", quantity: 1, unitPriceXof: 999, available: 0 }]);
    expect(summary.issues).toEqual([{ productId: "c", reason: "not_sellable" }]);
    expect(summary.lineCount).toBe(2);
    expect(summary.subtotalXof).toBe(4500);
  });

  it("applique le pas de commande avant de calculer", () => {
    const summary = summarizeCart([{ productId: "a", quantity: 7, unitPriceXof: 1000, quantityStep: 5 }]);
    expect(summary.subtotalXof).toBe(10_000);
  });
});

describe("mergeCarts", () => {
  it("additionne les quantités du même article", () => {
    const result = mergeCarts([{ productId: "a", quantity: 2 }], [{ productId: "a", quantity: 3 }]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].quantity).toBe(5);
    expect(result.merged).toBe(1);
  });

  it("ne fusionne pas deux combinaisons différentes du même produit", () => {
    const result = mergeCarts([{ productId: "a", variantId: 1, quantity: 2 }], [{ productId: "a", variantId: 2, quantity: 3 }]);
    expect(result.lines).toHaveLength(2);
  });

  it("ajoute les articles absents du panier existant", () => {
    const result = mergeCarts([{ productId: "a", quantity: 1 }], [{ productId: "b", quantity: 2 }]);
    expect(result.lines.map((line) => line.productId).sort()).toEqual(["a", "b"]);
  });

  it("écarte un article invendable", () => {
    const result = mergeCarts([], [{ productId: "a", quantity: 1, available: 0 }]);
    expect(result.lines).toHaveLength(0);
    expect(result.dropped).toBe(1);
  });

  it("borne la quantité fusionnée au stock disponible et le signale", () => {
    const result = mergeCarts([{ productId: "a", quantity: 4 }], [{ productId: "a", quantity: 4, available: 5 }]);
    expect(result.lines[0].quantity).toBe(5);
    expect(result.capped).toBe(1);
  });

  it("ne dépasse jamais le plafond de ligne", () => {
    const result = mergeCarts([{ productId: "a", quantity: 9000 }], [{ productId: "a", quantity: 9000 }]);
    expect(result.lines[0].quantity).toBeLessThanOrEqual(10_000);
  });

  it("reste stable : fusionner deux fois ne change plus rien", () => {
    const once = mergeCarts([{ productId: "a", quantity: 2 }], [{ productId: "b", quantity: 1 }]);
    const twice = mergeCarts(once.lines, []);
    expect(twice.lines).toEqual(once.lines);
  });
});

describe("isCartAbandoned", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("abandonne un panier inactif depuis plus de 24 h", () => {
    expect(isCartAbandoned({ status: "active", updatedAt: new Date("2026-06-14T10:00:00Z") }, now)).toBe(true);
  });

  it("laisse tranquille un panier récent", () => {
    expect(isCartAbandoned({ status: "active", updatedAt: new Date("2026-06-15T11:00:00Z") }, now)).toBe(false);
  });

  it("n'abandonne jamais un panier converti", () => {
    expect(isCartAbandoned({ status: "active", updatedAt: new Date("2026-01-01"), convertedOrderId: "order-1" }, now)).toBe(false);
  });

  it("respecte un seuil personnalisé", () => {
    const cart = { status: "active", updatedAt: new Date("2026-06-15T09:00:00Z") };
    expect(isCartAbandoned(cart, now, 2)).toBe(true);
    expect(isCartAbandoned(cart, now, 4)).toBe(false);
  });
});

describe("droit à l'effacement", () => {
  it("autorise l'anonymisation quand plus aucune commande n'est ouverte", () => {
    expect(canAnonymizeCustomer([{ status: "delivered" }, { status: "cancelled" }])).toEqual({ allowed: true, openOrders: 0 });
  });

  it("refuse tant qu'une commande est en cours", () => {
    expect(canAnonymizeCustomer([{ status: "shipped" }])).toEqual({ allowed: false, openOrders: 1 });
  });

  it("fournit une identité technique stable et non réversible en clair", () => {
    const identity = anonymizedIdentity("9f8c7b6a-1234-5678-9abc-def012345678");
    expect(identity.email).toMatch(/@anonymise\.invalid$/);
    expect(identity.name).toContain("anonymisé");
    expect(identity.phone).toBe("");
    expect(anonymizedIdentity("9f8c7b6a-1234-5678-9abc-def012345678")).toEqual(identity);
  });
});
