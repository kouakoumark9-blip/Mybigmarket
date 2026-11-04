/**
 * Le grand livre de stock est utilisé par la boutique (racine) et par le back-office (adminnew),
 * déployés séparément : la copie du back-office doit rester strictement identique.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("copie du grand livre de stock", () => {
  it("adminnew/lib/stock-ledger.ts est identique à lib/stock-ledger.ts", () => {
    expect(readFileSync("adminnew/lib/stock-ledger.ts", "utf8")).toBe(readFileSync("lib/stock-ledger.ts", "utf8"));
  });
});
