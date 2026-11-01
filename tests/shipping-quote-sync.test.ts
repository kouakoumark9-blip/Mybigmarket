import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou anti-divergence.
 *
 * adminnew est un projet Next distinct et ne peut pas importer `lib/` de la
 * racine. Le moteur de devis y est donc dupliqué. Ce test échoue dès que les
 * deux copies divergent : le simulateur d'administration doit toujours
 * chiffrer exactement comme le storefront.
 */

const root = resolve(__dirname, "..");

const body = (path: string) => {
  const content = readFileSync(resolve(root, path), "utf8");
  return content.slice(content.indexOf("*/") + 2).trim();
};

describe("synchronisation du moteur de transport", () => {
  it("lib/shipping-quote.ts et sa copie adminnew sont identiques", () => {
    expect(body("adminnew/lib/shipping-quote.ts")).toBe(body("lib/shipping-quote.ts"));
  });

  it("lib/shipping-calc.ts et sa copie adminnew sont identiques", () => {
    expect(body("adminnew/lib/shipping-calc.ts")).toBe(body("lib/shipping-calc.ts"));
  });

  it("la copie adminnew documente son origine", () => {
    const copy = readFileSync(resolve(root, "adminnew/lib/shipping-quote.ts"), "utf8");
    expect(copy).toContain("COPIE SYNCHRONISÉE");
    expect(copy).toContain("lib/shipping-quote.ts");
  });
});
