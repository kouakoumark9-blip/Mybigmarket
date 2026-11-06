import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
import { resolveCountryLanguage, destinationByCode } from "@/lib/west-africa";

const root = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "adminnew", "tests", "i18n"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("traduction de l'interface", () => {
  it("garde le français tel quel et remplace les variables", () => {
    expect(translate("fr", "Ajouter au panier")).toBe("Ajouter au panier");
    expect(translate("en", "Ajouter au panier")).toBe("Add to cart");
    expect(translate("pt", "{n} avis", { n: 3 })).toBe("3 avaliações");
    expect(translate("ar", "Ajouter au panier")).toBe("أضف إلى السلة");
    expect(translate("en", "Texte inconnu")).toBe("Texte inconnu");
  });

  it("chaque texte du code a une traduction dans les trois langues, avec les mêmes variables", () => {
    const keys = new Set<string>();
    for (const file of walk(root)) {
      for (const match of readFileSync(file, "utf8").matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(match[1].replace(/\\"/g, '"'));
    }
    expect(keys.size).toBeGreaterThan(150);
    const missing: string[] = [];
    for (const key of keys) {
      const vars = (key.match(/\{\w+\}/g) ?? []).sort().join();
      for (const lang of ["en", "pt", "ar"] as const) {
        const text = translate(lang, key);
        if (text === key && !/^[A-Za-z0-9 ©·:.'’{}()\-–%#/]+$/.test(key)) missing.push(`${lang}: ${key}`);
        if ((text.match(/\{\w+\}/g) ?? []).sort().join() !== vars) missing.push(`variables ${lang}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("choisit la langue du pays, ou la seconde langue mémorisée quand le pays la propose", () => {
    expect(resolveCountryLanguage(destinationByCode("GH"))).toBe("en");
    expect(resolveCountryLanguage(destinationByCode("CV"))).toBe("pt");
    expect(resolveCountryLanguage(destinationByCode("MR"))).toBe("ar");
    expect(resolveCountryLanguage(destinationByCode("CI"), "en")).toBe("en");
    expect(resolveCountryLanguage(destinationByCode("SN"), "en")).toBe("fr");
  });
});
