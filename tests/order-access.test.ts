import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isValidOrderAccessKey, orderAccessKey } from "@/lib/shop/order-access";

describe("clé d'accès à la confirmation de commande", () => {
  const saved = process.env.AUTH_SECRET;
  beforeEach(() => { process.env.AUTH_SECRET = "secret-de-test-pour-les-commandes"; });
  afterEach(() => { process.env.AUTH_SECRET = saved; });

  it("est propre à chaque commande et stable", () => {
    const a = orderAccessKey("MBM-251111-AB12");
    expect(a).toHaveLength(32);
    expect(orderAccessKey("MBM-251111-AB12")).toBe(a);
    expect(orderAccessKey("MBM-251111-AB13")).not.toBe(a);
  });

  it("accepte la bonne clé et refuse le reste", () => {
    const key = orderAccessKey("MBM-251111-AB12");
    expect(isValidOrderAccessKey("MBM-251111-AB12", key)).toBe(true);
    expect(isValidOrderAccessKey("MBM-251111-AB13", key)).toBe(false); // la clé d'une autre commande
    expect(isValidOrderAccessKey("MBM-251111-AB12", undefined)).toBe(false);
    expect(isValidOrderAccessKey("MBM-251111-AB12", "")).toBe(false);
    expect(isValidOrderAccessKey("MBM-251111-AB12", "x".repeat(32))).toBe(false);
    expect(isValidOrderAccessKey("MBM-251111-AB12", key.slice(0, 31))).toBe(false);
  });

  it("ne se devine pas avec un autre secret serveur", () => {
    const key = orderAccessKey("MBM-251111-AB12");
    process.env.AUTH_SECRET = "un-autre-secret";
    expect(isValidOrderAccessKey("MBM-251111-AB12", key)).toBe(false);
  });
});
