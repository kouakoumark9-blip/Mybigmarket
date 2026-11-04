import { describe, expect, it } from "vitest";
import { combineVouchers, evaluateVoucher, normalizeVoucherCode, type VoucherRule } from "@/lib/vouchers";

const now = new Date("2026-11-04T12:00:00Z");
const lines = [
  { productId: "p1", categoryIds: [1], unitPriceXof: 10_000, quantity: 2 },
  { productId: "p2", categoryIds: [2], unitPriceXof: 5_000, quantity: 1, discounted: true },
];
const rule = (overrides: Partial<VoucherRule> = {}): VoucherRule => ({ id: "v1", code: "BIENVENUE", isActive: true, discountType: "percent", discountValue: 10, ...overrides });

describe("bons de réduction", () => {
  it("normalise le code saisi", () => {
    expect(normalizeVoucherCode("  bien venue ")).toBe("BIENVENUE");
  });

  it("calcule une remise en pourcentage plafonnée sur les lignes éligibles", () => {
    expect(evaluateVoucher(rule(), { lines, now })).toMatchObject({ valid: true, discountXof: 2_500, eligibleSubtotalXof: 25_000 });
    expect(evaluateVoucher(rule({ maximumDiscountXof: 1_000 }), { lines, now })).toMatchObject({ valid: true, discountXof: 1_000 });
    expect(evaluateVoucher(rule({ excludeDiscountedProducts: true }), { lines, now })).toMatchObject({ valid: true, discountXof: 2_000, eligibleSubtotalXof: 20_000 });
    expect(evaluateVoucher(rule({ categoryIds: [2] }), { lines, now })).toMatchObject({ valid: true, discountXof: 500 });
  });

  it("ne remise jamais plus que le montant éligible", () => {
    expect(evaluateVoucher(rule({ discountType: "amount", discountValue: 90_000 }), { lines, now })).toMatchObject({ valid: true, discountXof: 25_000 });
  });

  it("refuse avec un motif précis", () => {
    expect(evaluateVoucher(rule({ isActive: false }), { lines, now })).toMatchObject({ valid: false, reason: "inactive" });
    expect(evaluateVoucher(rule({ endsAt: new Date("2026-11-01") }), { lines, now })).toMatchObject({ valid: false, reason: "expired" });
    expect(evaluateVoucher(rule({ startsAt: new Date("2026-12-01") }), { lines, now })).toMatchObject({ valid: false, reason: "not_started" });
    expect(evaluateVoucher(rule({ usageLimit: 5, usageCount: 5 }), { lines, now })).toMatchObject({ valid: false, reason: "usage_limit_reached" });
    expect(evaluateVoucher(rule({ perCustomerLimit: 1 }), { lines, now })).toMatchObject({ valid: false, reason: "login_required" });
    expect(evaluateVoucher(rule({ perCustomerLimit: 1 }), { lines, now, customerId: "c1", customerUsageCount: 1 })).toMatchObject({ valid: false, reason: "customer_limit_reached" });
    expect(evaluateVoucher(rule({ customerId: "c2" }), { lines, now, customerId: "c1" })).toMatchObject({ valid: false, reason: "wrong_customer" });
    expect(evaluateVoucher(rule({ customerGroupId: 3 }), { lines, now, customerId: "c1", customerGroupIds: [1] })).toMatchObject({ valid: false, reason: "wrong_group" });
    expect(evaluateVoucher(rule({ minimumSubtotalXof: 30_000 }), { lines, now })).toMatchObject({ valid: false, reason: "minimum_not_reached" });
    expect(evaluateVoucher(rule({ productIds: ["p9"] }), { lines, now })).toMatchObject({ valid: false, reason: "no_eligible_product" });
  });

  it("retient la combinaison la plus avantageuse et refuse les bons non cumulables", () => {
    const a = evaluateVoucher(rule({ id: "a", code: "A", combinable: true, discountType: "amount", discountValue: 1_000 }), { lines, now });
    const b = evaluateVoucher(rule({ id: "b", code: "B", combinable: true, discountType: "amount", discountValue: 1_500 }), { lines, now });
    const c = evaluateVoucher(rule({ id: "c", code: "C", combinable: false, discountType: "amount", discountValue: 2_000 }), { lines, now });
    const stacked = combineVouchers([a, b, c], 25_000);
    expect(stacked.applied.map((entry) => entry.code)).toEqual(["A", "B"]);
    expect(stacked.discountXof).toBe(2_500);
    expect(stacked.rejected).toEqual([expect.objectContaining({ code: "C", reason: "not_combinable" })]);
    const single = combineVouchers([a, evaluateVoucher(rule({ id: "d", code: "D", discountType: "amount", discountValue: 4_000 }), { lines, now })], 25_000);
    expect(single.applied.map((entry) => entry.code)).toEqual(["D"]);
  });

  it("transmet la livraison offerte", () => {
    const free = evaluateVoucher(rule({ discountType: "none", discountValue: 0, freeShipping: true }), { lines, now });
    expect(free).toMatchObject({ valid: true, discountXof: 0, freeShipping: true });
    expect(combineVouchers([free], 25_000).freeShipping).toBe(true);
  });
});
