import { describe, expect, it } from "vitest";
import {
  allocateProRata,
  buildInvoice,
  canPaySeller,
  canRefund,
  canTransition,
  canVoidInvoice,
  computeOrderTotals,
  emailTriggerForTransition,
  invoiceNumber,
  isInvoiceImmutable,
  isPaymentExpired,
  isReturnWithinWindow,
  nextStatuses,
  shouldDecrementStock,
  shouldRestockOnReturn,
  shouldRestoreStock,
  validateReturn,
} from "../lib/order-rules";

describe("machine à états des commandes", () => {
  it("autorise le parcours nominal complet", () => {
    const path = ["paid_escrow", "seller_confirmed", "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid"];
    let current = "awaiting_payment";
    for (const target of path) {
      expect(canTransition(current, target).allowed).toBe(true);
      current = target;
    }
  });

  it("refuse un saut direct de la commande non payée à la livraison", () => {
    const result = canTransition("awaiting_payment", "delivered");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("not_allowed");
  });

  it("refuse tout changement depuis un statut terminal", () => {
    expect(canTransition("cancelled", "paid_escrow").allowed).toBe(false);
    expect(canTransition("refunded", "paid_escrow").allowed).toBe(false);
    expect(canTransition("seller_paid", "delivered").allowed).toBe(false);
  });

  it("signale l'absence de changement", () => {
    expect(canTransition("shipped", "shipped").allowed).toBe(false);
  });

  it("refuse un statut inconnu", () => {
    const result = canTransition("livrée_peut_être", "delivered");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("unknown_status");
  });

  it("permet de basculer en litige depuis une commande expédiée", () => {
    expect(canTransition("shipped", "dispute").allowed).toBe(true);
    expect(canTransition("dispute", "refunded").allowed).toBe(true);
  });

  it("n'ouvre aucune suite depuis un statut terminal", () => {
    expect(nextStatuses("cancelled")).toEqual([]);
    expect(nextStatuses("refunded")).toEqual([]);
    expect(nextStatuses("seller_paid")).toEqual([]);
  });

  it("liste les suites possibles sans jamais inclure le statut courant", () => {
    const next = nextStatuses("paid_escrow");
    expect(next).toContain("seller_confirmed");
    expect(next).not.toContain("paid_escrow");
  });
});

describe("effets de bord des transitions", () => {
  it("expire une commande impayée après le délai", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    expect(isPaymentExpired({ status: "awaiting_payment", paymentExpiresAt: new Date("2026-06-15T10:00:00Z") }, now)).toBe(true);
    expect(isPaymentExpired({ status: "awaiting_payment", paymentExpiresAt: new Date("2026-06-15T14:00:00Z") }, now)).toBe(false);
  });

  it("n'expire jamais une commande déjà payée", () => {
    expect(isPaymentExpired({ status: "paid_escrow", paymentExpiresAt: new Date("2020-01-01") }, new Date())).toBe(false);
  });

  it("décrémente le stock uniquement au paiement", () => {
    expect(shouldDecrementStock("paid_escrow")).toBe(true);
    expect(shouldDecrementStock("seller_confirmed")).toBe(false);
  });

  it("remet le stock en vente seulement pour une annulation avant expédition", () => {
    expect(shouldRestoreStock("awaiting_payment", "cancelled")).toBe(true);
    expect(shouldRestoreStock("seller_confirmed", "cancelled")).toBe(true);
    expect(shouldRestoreStock("shipped", "cancelled")).toBe(false);
    expect(shouldRestoreStock("shipped", "delivered")).toBe(false);
  });

  it("ne paie le vendeur qu'après une livraison effective", () => {
    expect(canPaySeller({ status: "delivered", deliveredAt: new Date() })).toBe(true);
    expect(canPaySeller({ status: "delivered" })).toBe(false);
    expect(canPaySeller({ status: "arrived_abidjan", deliveredAt: new Date() })).toBe(false);
  });

  it("associe un e-mail à chaque transition qui le mérite", () => {
    expect(emailTriggerForTransition("awaiting_payment", "paid_escrow")).toBe("payment_confirmed");
    expect(emailTriggerForTransition("shipped", "delivered")).toBe("order_delivered");
    expect(emailTriggerForTransition("awaiting_payment", "cancelled")).toBe("order_cancelled");
    expect(emailTriggerForTransition("dispute", "refunded")).toBe("order_refunded");
    expect(emailTriggerForTransition("shipped", "arrived_abidjan")).toBeNull();
  });
});

describe("totaux de commande", () => {
  const lines = [
    { productId: "a", quantity: 2, unitPriceXof: 10_000, taxRatePercent: 18 },
    { productId: "b", quantity: 1, unitPriceXof: 5_000, taxRatePercent: 18 },
  ];

  it("additionne les lignes et calcule la taxe par ligne", () => {
    const totals = computeOrderTotals({ lines });
    expect(totals.subtotalXof).toBe(25_000);
    expect(totals.itemCount).toBe(3);
    expect(totals.taxXof).toBe(4_500);
    expect(totals.totalXof).toBe(29_500);
  });

  it("applique un arrondi commercial au multiple de 25", () => {
    const totals = computeOrderTotals({ lines: [{ productId: "a", quantity: 1, unitPriceXof: 1_001, taxRatePercent: 0 }] });
    expect(totals.totalXof % 25).toBe(0);
  });

  it("répartit une remise globale et taxe sur la base remisée", () => {
    const totals = computeOrderTotals({ lines, discountBasisPoints: 1_000 });
    expect(totals.discountXof).toBe(2_500);
    expect(totals.taxXof).toBe(4_050);
    expect(totals.totalXof).toBe(25_000 - 2_500 + 4_050);
  });

  it("ne rend jamais un montant négatif", () => {
    const totals = computeOrderTotals({ lines, discountBasisPoints: 10_000 });
    expect(totals.discountXof).toBe(25_000);
    expect(totals.taxXof).toBe(0);
    expect(totals.totalXof).toBe(0);
  });

  it("ajoute le port et sa taxe propre", () => {
    const totals = computeOrderTotals({ lines, shippingXof: 9_000, shippingTaxRatePercent: 18 });
    expect(totals.shippingXof).toBe(9_000);
    expect(totals.taxXof).toBe(4_500 + 1_620);
  });

  it("ajoute les frais de paiement au total", () => {
    const totals = computeOrderTotals({ lines, paymentFeeXof: 1_000 });
    expect(totals.paymentFeeXof).toBe(1_000);
    expect(totals.totalXof).toBe(30_500);
  });

  it("ignore les lignes à quantité nulle et totalise le poids", () => {
    const totals = computeOrderTotals({
      lines: [
        { productId: "a", quantity: 2, unitPriceXof: 1000, weightGrams: 500 },
        { productId: "b", quantity: 0, unitPriceXof: 9999 },
      ],
    });
    expect(totals.subtotalXof).toBe(2000);
    expect(totals.weightGrams).toBe(1000);
    expect(totals.itemCount).toBe(2);
  });

  it("accepte une commande vide sans produire de montant", () => {
    const totals = computeOrderTotals({ lines: [] });
    expect(totals.totalXof).toBe(0);
    expect(totals.subtotalXof).toBe(0);
  });
});

describe("allocateProRata", () => {
  it("répartit exactement le total, sans perdre un franc", () => {
    const parts = allocateProRata(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("respecte les proportions", () => {
    const [a, b] = allocateProRata(1000, [300, 700]);
    expect(a).toBe(300);
    expect(b).toBe(700);
  });

  it("renvoie des zéros sans base", () => {
    expect(allocateProRata(1000, [0, 0])).toEqual([0, 0]);
  });
});

describe("factures", () => {
  const base = {
    orderId: "order-1",
    number: "FAC-2026-000001",
    lines: [{ label: "Article", quantity: 2, unitPriceXof: 10_000, taxRatePercent: 18 }],
    subtotalXof: 20_000,
    discountXof: 0,
    shippingXof: 0,
    taxXof: 3_600,
    totalXof: 23_600,
  };

  it("émet une facture cohérente", () => {
    const result = buildInvoice(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.number).toBe("FAC-2026-000001");
      expect(result.invoice.issuedAt).toBeInstanceOf(Date);
    }
  });

  it("refuse de régénérer une facture déjà émise", () => {
    const result = buildInvoice({ ...base, issuedAt: new Date() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_issued");
  });

  it("refuse une facture sans numéro", () => {
    const result = buildInvoice({ ...base, number: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_number");
  });

  it("refuse une facture dont le sous-total ne correspond pas aux lignes", () => {
    const result = buildInvoice({ ...base, subtotalXof: 19_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_total");
  });

  it("refuse une facture sans ligne", () => {
    const result = buildInvoice({ ...base, lines: [], subtotalXof: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("numérote en séquence continue sur six chiffres", () => {
    expect(invoiceNumber(2026, 1)).toBe("FAC-2026-000001");
    expect(invoiceNumber(2026, 123456)).toBe("FAC-2026-123456");
    expect(invoiceNumber(2026, 0)).toBe("FAC-2026-000001");
  });

  it("rend immuable une facture émise", () => {
    expect(isInvoiceImmutable({ status: "issued", issuedAt: new Date() })).toBe(true);
    expect(isInvoiceImmutable({ status: "draft", issuedAt: null })).toBe(false);
  });

  it("n'annule qu'une facture réellement émise", () => {
    expect(canVoidInvoice({ status: "issued", issuedAt: new Date() })).toBe(true);
    expect(canVoidInvoice({ status: "draft", issuedAt: null })).toBe(false);
    expect(canVoidInvoice({ status: "void", issuedAt: new Date() })).toBe(false);
  });
});

describe("retours", () => {
  const delivered = [
    { productId: "a", quantity: 1, unitPriceXof: 10_000, deliveredQuantity: 3 },
    { productId: "b", quantity: 2, unitPriceXof: 2_500, deliveredQuantity: 2 },
  ];

  it("accepte un retour dans la limite du livré", () => {
    const result = validateReturn(delivered);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.amountXof).toBe(15_000);
  });

  it("refuse un retour supérieur au livré", () => {
    const result = validateReturn([{ productId: "a", quantity: 5, unitPriceXof: 1000, deliveredQuantity: 3 }]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("exceeds_delivered");
  });

  it("tient compte des retours déjà effectués", () => {
    const result = validateReturn([{ productId: "a", quantity: 2, unitPriceXof: 1000, deliveredQuantity: 3, alreadyReturned: 2 }]);
    expect(result.valid).toBe(false);
  });

  it("refuse une quantité négative", () => {
    const result = validateReturn([{ productId: "a", quantity: -1, unitPriceXof: 1000, deliveredQuantity: 3 }]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("negative");
  });

  it("refuse un retour vide", () => {
    expect(validateReturn([]).valid).toBe(false);
    expect(validateReturn([{ productId: "a", quantity: 0, unitPriceXof: 1000, deliveredQuantity: 3 }]).valid).toBe(false);
  });

  it("respecte les délais selon le motif", () => {
    const deliveredAt = new Date("2026-06-01T00:00:00Z");
    expect(isReturnWithinWindow("changed_mind", deliveredAt, new Date("2026-06-10T00:00:00Z"))).toBe(true);
    expect(isReturnWithinWindow("changed_mind", deliveredAt, new Date("2026-06-20T00:00:00Z"))).toBe(false);
    expect(isReturnWithinWindow("damaged", deliveredAt, new Date("2026-06-20T00:00:00Z"))).toBe(true);
    expect(isReturnWithinWindow("damaged", deliveredAt, new Date("2026-07-10T00:00:00Z"))).toBe(false);
  });

  it("ne remet pas en stock un article endommagé", () => {
    expect(shouldRestockOnReturn("damaged")).toBe(false);
    expect(shouldRestockOnReturn("changed_mind")).toBe(true);
    expect(shouldRestockOnReturn("wrong_item", "used")).toBe(false);
  });
});

describe("remboursements", () => {
  it("autorise un remboursement partiel", () => {
    const result = canRefund(10_000, 0, 4_000);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.remainingXof).toBe(6_000);
  });

  it("refuse de rembourser plus que l'encaissé", () => {
    const result = canRefund(10_000, 8_000, 5_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("over_paid");
  });

  it("refuse un remboursement sans encaissement", () => {
    const result = canRefund(0, 0, 1_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("not_paid");
  });

  it("refuse un montant nul ou négatif", () => {
    expect(canRefund(10_000, 0, 0).allowed).toBe(false);
    expect(canRefund(10_000, 0, -500).allowed).toBe(false);
  });

  it("autorise le solde exact restant", () => {
    const result = canRefund(10_000, 9_000, 1_000);
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.remainingXof).toBe(0);
  });
});
