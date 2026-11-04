import { describe, expect, it } from "vitest";
import { brandScopeStyle, contrastRatio, DEFAULT_BRAND_COLOR, hexToRgb, pickOnColor, themeBootScript } from "../lib/theme/brand";

describe("thème de marque", () => {
  it("lit les couleurs hexadécimales courtes et longues", () => {
    expect(hexToRgb("#FF6A00")).toEqual([255, 106, 0]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("pas une couleur")).toBeNull();
  });

  it("choisit un texte on-primary conforme WCAG AA (4,5:1) sur la couleur et son hover", () => {
    for (const hex of [DEFAULT_BRAND_COLOR, "#0057FF", "#16A34A", "#7C3AED", "#FACC15", "#111827"]) {
      const on = pickOnColor(hex);
      const rgb = hexToRgb(hex)!;
      const hover = rgb.map((v) => v * 0.9) as [number, number, number];
      const onRgb = hexToRgb(on)!;
      expect(Math.min(contrastRatio(onRgb, rgb), contrastRatio(onRgb, hover))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("donne du blanc sur le bleu et du noir sur l'orange par défaut", () => {
    expect(pickOnColor("#0057FF")).toBe("#FFFFFF");
    expect(pickOnColor("#FF6A00")).toBe("#000000");
  });

  it("produit un style de prévisualisation limité à --brand-color", () => {
    expect(brandScopeStyle("#16A34A")).toEqual({ "--brand-color": "#16A34A", "--color-on-primary": "#000000" });
  });

  it("génère un script inline autonome", () => {
    const script = themeBootScript();
    expect(script).toContain("bootTheme");
    expect(script).toContain(DEFAULT_BRAND_COLOR);
    expect(() => new Function(script)).not.toThrow();
  });
});
