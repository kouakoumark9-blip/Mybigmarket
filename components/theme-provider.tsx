"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { bootTheme, type BrandTheme } from "@/lib/theme/brand";

type ColorScheme = "system" | "light" | "dark";

type ThemeContextValue = {
  /** Thème actif (null avant hydratation). */
  theme: BrandTheme | null;
  /** Change toute la palette à partir d'une seule couleur (#0057FF, rgb(), hsl()…). */
  setBrandColor: (color: string) => void;
  /** Relance la détection automatique (variable CSS → meta → DOM → défaut). */
  resetBrandColor: () => void;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: React.ReactNode;
  /** Couleur de repli quand rien n'est détecté (défaut : #FF6A00). */
  fallbackColor?: string;
  /** Désactive l'étape « couleur du bouton / lien principal ». */
  scanDom?: boolean;
};

/**
 * Applique le thème de marque à toute la page.
 *
 * Le script inline <ThemeScript/> fait une première détection avant
 * l'affichage (variable CSS, meta theme-color). Au montage, ce provider
 * relance la détection complète, DOM compris, puis expose setBrandColor().
 */
export function ThemeProvider({ children, fallbackColor, scanDom = true }: ThemeProviderProps) {
  const [theme, setTheme] = useState<BrandTheme | null>(null);
  const [colorScheme, setScheme] = useState<ColorScheme>("system");

  const detect = useCallback(() => {
    const root = document.documentElement;
    root.style.removeProperty("--brand-color");
    root.style.removeProperty("--color-on-primary");
    root.removeAttribute("data-brand-source");
    setTheme(bootTheme({ fallback: fallbackColor, scanDom }));
  }, [fallbackColor, scanDom]);

  useEffect(() => {
    // Après le premier rendu, quand le DOM du site est disponible.
    const frame = requestAnimationFrame(() => {
      // Le script inline a déjà appliqué une couleur hôte : on la garde.
      const source = document.documentElement.getAttribute("data-brand-source");
      if (source === "css-variable" || source === "meta-theme-color") setTheme(bootTheme({ fallback: fallbackColor, scanDom: false }));
      else detect();
      const stored = readScheme();
      if (stored !== "system") { document.documentElement.setAttribute("data-theme", stored); setScheme(stored); }
    });
    return () => cancelAnimationFrame(frame);
  }, [detect, fallbackColor]);

  useEffect(() => {
    // Quelqu'un modifie directement --brand-color sur <html> (console, script
    // du site hôte…) : on recalcule le texte lisible et l'état exposé.
    const root = document.documentElement;
    let last = root.style.getPropertyValue("--brand-color").trim();
    const observer = new MutationObserver(() => {
      const current = root.style.getPropertyValue("--brand-color").trim();
      if (!current || current === last) return;
      last = current;
      // Changement fait par bootTheme lui-même (détection) : simple synchro.
      const applied = (window as unknown as { __brandTheme?: BrandTheme }).__brandTheme;
      if (applied && applied.color === current) { setTheme(applied); return; }
      const next = bootTheme({ color: current, scanDom: false });
      if (next) { last = next.color; setTheme(next); }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  const setBrandColor = useCallback((color: string) => {
    const next = bootTheme({ color, fallback: fallbackColor, scanDom: false });
    if (next) setTheme(next);
  }, [fallbackColor]);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    const root = document.documentElement;
    if (scheme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", scheme);
    try { window.localStorage.setItem("mybigmarket-color-scheme", scheme); } catch { /* stockage indisponible */ }
    setScheme(scheme);
  }, []);

  const value = useMemo(() => ({ theme, setBrandColor, resetBrandColor: detect, colorScheme, setColorScheme }), [theme, setBrandColor, detect, colorScheme, setColorScheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function readScheme(): ColorScheme {
  try {
    const value = window.localStorage.getItem("mybigmarket-color-scheme");
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme doit être utilisé dans <ThemeProvider>.");
  return context;
}
