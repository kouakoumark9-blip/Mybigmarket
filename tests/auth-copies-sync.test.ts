/**
 * Le back-office (adminnew) est déployé séparément et ne peut pas importer server/ :
 * il garde une copie des modules d'authentification. Ces copies doivent rester identiques.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const strip = (text: string) => text.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");

describe("copies d'authentification du back-office", () => {
  it("adminnew/lib/password.ts est identique à server/core/auth/password.ts", () => {
    expect(readFileSync("adminnew/lib/password.ts", "utf8")).toBe(readFileSync("server/core/auth/password.ts", "utf8"));
  });
  it("server/core/auth/totp.ts reprend adminnew/lib/totp.ts à l'identique", () => {
    expect(strip(readFileSync("server/core/auth/totp.ts", "utf8"))).toBe(readFileSync("adminnew/lib/totp.ts", "utf8"));
  });
});
