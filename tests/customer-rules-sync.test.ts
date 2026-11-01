import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou anti-divergence pour les règles clients.
 *
 * adminnew est un projet Next distinct : il duplique `lib/customer-rules.ts`.
 * Ce test échoue dès que les deux copies divergent, ce qui garantirait un
 * écart de validation entre le storefront et le back office.
 */

const root = resolve(__dirname, "..");

const body = (path: string) => {
  const content = readFileSync(resolve(root, path), "utf8");
  return content.slice(content.indexOf("*/") + 2).trim();
};

describe("synchronisation des règles clients", () => {
  it("lib/customer-rules.ts et sa copie adminnew sont identiques", () => {
    expect(body("adminnew/lib/customer-rules.ts")).toBe(body("lib/customer-rules.ts"));
  });

  it("la copie adminnew documente son origine", () => {
    const copy = readFileSync(resolve(root, "adminnew/lib/customer-rules.ts"), "utf8");
    expect(copy).toContain("COPIE SYNCHRONISÉE");
    expect(copy).toContain("lib/customer-rules.ts");
  });
});
