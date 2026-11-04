/**
 * Thème de marque : une seule couleur (--brand-color) pilote toute la palette.
 * Les dérivées (hover, soft, …) sont calculées en CSS dans app/theme.css ;
 * ce module détecte la couleur du site hôte et calcule --color-on-primary
 * selon le contraste WCAG exact.
 */

import type { CSSProperties } from "react";

/** Couleur utilisée quand aucune couleur de marque n'est détectée. */
export const DEFAULT_BRAND_COLOR = "#FF6A00";

/** Exemples de thèmes pour la page de démonstration. */
export const BRAND_PRESETS = [
  { id: "orange", label: "Orange (défaut)", value: DEFAULT_BRAND_COLOR },
  { id: "blue", label: "Bleu", value: "#0057FF" },
  { id: "green", label: "Vert", value: "#16A34A" },
] as const;

export type BrandSource = "css-variable" | "meta-theme-color" | "dom" | "default" | "manual";

export type BrandTheme = {
  /** Couleur de marque normalisée en #RRGGBB. */
  color: string;
  /** Couleur de texte lisible sur la couleur primaire (#FFFFFF ou #000000). */
  onPrimary: string;
  /** Contraste WCAG du texte on-primary sur la couleur primaire. */
  contrast: number;
  source: BrandSource;
};

export type BootThemeOptions = {
  /** Couleur par défaut (étape d). */
  fallback?: string;
  /** Si false, l'étape c (lecture du DOM) est ignorée. */
  scanDom?: boolean;
  /** Couleur imposée (source "manual"), prioritaire sur la détection. */
  color?: string;
  /** Élément cible ; documentElement par défaut. */
  target?: HTMLElement;
};

/**
 * Détecte la couleur de marque et l'applique via style.setProperty.
 *
 * Priorité :
 *   a) variable CSS --brand-color ou --primary déjà définie par le site hôte
 *   b) <meta name="theme-color">
 *   c) couleur du bouton principal / lien principal (getComputedStyle)
 *   d) valeur par défaut (#FF6A00)
 *
 * IMPORTANT : cette fonction est sérialisée (toString) dans un <script> inline
 * pour s'exécuter avant le premier affichage. Elle doit rester autonome :
 * aucune référence à une variable extérieure, aucun import.
 */
export function bootTheme(options?: BootThemeOptions): BrandTheme | null {
  if (typeof document === "undefined") return null;
  const opts = options || {};
  const root = document.documentElement;
  const target = opts.target || root;
  const fallback = opts.fallback || "#FF6A00";

  function toRgb(input: string | null | undefined): number[] | null {
    if (!input) return null;
    let value = String(input).trim();
    if (!value || value === "transparent" || value === "none") return null;
    // Triplet HSL sans fonction (ex. shadcn : "24 100% 50%")
    if (/^-?[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%$/.test(value)) value = "hsl(" + value + ")";
    const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2) + (h.length === 4 ? h.charAt(3) + h.charAt(3) : "");
      if (h.length !== 6 && h.length !== 8) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    // Normalisation par le navigateur pour tout autre format (hsl, nom, oklch…)
    const probe = document.createElement("i");
    probe.style.color = "";
    probe.style.color = value;
    if (!probe.style.color) return null;
    probe.style.display = "none";
    root.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    root.removeChild(probe);
    const nums = computed.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return null;
    if (/^color\(srgb/.test(computed)) return [Math.round(+nums[0] * 255), Math.round(+nums[1] * 255), Math.round(+nums[2] * 255), nums.length > 3 ? +nums[3] : 1];
    if (/^rgba?\(/.test(computed)) return [+nums[0], +nums[1], +nums[2], nums.length > 3 ? +nums[3] : 1];
    return null;
  }
  function toHex(rgb: number[]): string {
    let out = "#";
    for (let i = 0; i < 3; i++) out += ("0" + Math.max(0, Math.min(255, Math.round(rgb[i]))).toString(16)).slice(-2);
    return out.toUpperCase();
  }
  function luminance(rgb: number[]): number {
    const c = [rgb[0], rgb[1], rgb[2]].map(function (v) { v = v / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a: number, b: number): number { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
  /** Couleur chromatique utilisable comme marque (ni gris, ni presque blanc/noir). */
  function isBrandLike(rgb: number[] | null): boolean {
    if (!rgb || rgb[3] < 0.6) return false;
    const max = Math.max(rgb[0], rgb[1], rgb[2]) / 255, min = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
    const l = (max + min) / 2, d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return s >= 0.25 && d >= 0.12 && l >= 0.12 && l <= 0.88;
  }

  let found: number[] | null = null;
  let source: BrandSource = "default";

  if (opts.color) { found = toRgb(opts.color); if (found) source = "manual"; }

  // a) variable CSS déclarée par le site hôte
  if (!found) {
    const rootStyle = getComputedStyle(root);
    const names = ["--brand-color", "--primary"];
    for (let n = 0; n < names.length && !found; n++) {
      // une valeur posée par un appel précédent n'est pas une « couleur de l'hôte »
      if (names[n] === "--brand-color" && root.getAttribute("data-brand-source") && root.getAttribute("data-brand-source") !== "css-variable") continue;
      found = toRgb(rootStyle.getPropertyValue(names[n]));
    }
    if (found) source = "css-variable";
  }

  // b) <meta name="theme-color"> (en ignorant les variantes media non actives)
  if (!found) {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    for (let m = 0; m < metas.length && !found; m++) {
      const media = metas[m].getAttribute("media");
      if (media && window.matchMedia && !window.matchMedia(media).matches) continue;
      found = toRgb(metas[m].getAttribute("content"));
    }
    if (found) source = "meta-theme-color";
  }

  // c) bouton principal puis lien principal du site
  if (!found && opts.scanDom !== false && document.body) {
    // Couleurs déjà produites par notre propre thème : à ignorer, sinon la
    // détection se lirait elle-même.
    const rootComputed = getComputedStyle(root);
    const own: number[][] = [];
    // + les couleurs sémantiques fixes (WhatsApp, succès, erreur, étoiles, drapeaux).
    const tokens = ["--color-primary", "--color-primary-hover", "--color-primary-strong", "--color-primary-soft", "--color-primary-muted",
      "--color-whatsapp", "--color-success", "--color-danger", "--color-rating", "--color-info", "--flag-ci-orange", "--flag-ci-green", "--flag-cn-red", "--flag-cn-yellow"];
    for (let t = 0; t < tokens.length; t++) { const rgbTok = toRgb(rootComputed.getPropertyValue(tokens[t])); if (rgbTok) own.push(rgbTok); }
    const same = function (a: number[] | null) {
      if (!a) return false;
      for (let o = 0; o < own.length; o++) if (Math.abs(a[0] - own[o][0]) + Math.abs(a[1] - own[o][1]) + Math.abs(a[2] - own[o][2]) < 10) return true;
      return false;
    };
    const selectors = [
      "[data-brand-primary]", ".btn-primary", ".button-primary", ".btn--primary", ".wp-element-button", ".wp-block-button__link",
      "button[type=submit]", ".btn", "a.button", "button", "header a", "nav a", "main a", "a",
    ];
    outer: for (let s = 0; s < selectors.length; s++) {
      const nodes = document.querySelectorAll(selectors[s]);
      for (let e = 0; e < nodes.length && e < 40; e++) {
        const el = nodes[e] as HTMLElement;
        if (el.closest("[data-theme-ignore],[data-theme-scope]")) continue;
        const cs = getComputedStyle(el);
        const candidates = [toRgb(cs.backgroundColor), toRgb(cs.color)];
        for (let c = 0; c < candidates.length; c++) {
          // on ignore les éléments déjà colorés par notre propre thème
          if (isBrandLike(candidates[c]) && !same(candidates[c])) { found = candidates[c]; source = "dom"; break outer; }
        }
      }
    }
  }

  // d) valeur par défaut
  if (!found) { found = toRgb(fallback) || [255, 106, 0, 1]; source = "default"; }

  // Texte sur primaire : blanc ou noir, celui qui garde le meilleur contraste
  // à la fois sur la couleur primaire et sur son état hover (-10 %).
  const lum = luminance(found);
  const lumHover = luminance([found[0] * 0.9, found[1] * 0.9, found[2] * 0.9]);
  const white = Math.min(contrast(1, lum), contrast(1, lumHover));
  const black = Math.min(contrast(0, lum), contrast(0, lumHover));
  const onPrimary = white >= 4.5 || white >= black ? "#FFFFFF" : "#000000";

  const color = toHex(found);
  target.style.setProperty("--brand-color", color);
  target.style.setProperty("--color-on-primary", onPrimary);
  target.setAttribute("data-brand-source", source);
  const result: BrandTheme = { color: color, onPrimary: onPrimary, contrast: Math.round(Math.max(white, black) * 100) / 100, source: source };
  if (target === root) (window as unknown as { __brandTheme?: BrandTheme }).__brandTheme = result;
  return result;
}

/* ------------------------------------------------------------------------- */
/* Utilitaires purs (tests, rendu serveur)                                   */
/* ------------------------------------------------------------------------- */

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const h = match[1].length === 3 ? match[1].split("").map((c) => c + c).join("") : match[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Blanc ou noir, selon le meilleur contraste sur la couleur et son hover (-10 %). */
export function pickOnColor(hex: string): "#FFFFFF" | "#000000" {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#FFFFFF";
  const hover = rgb.map((v) => v * 0.9) as [number, number, number];
  const white = Math.min(contrastRatio([255, 255, 255], rgb), contrastRatio([255, 255, 255], hover));
  const black = Math.min(contrastRatio([0, 0, 0], rgb), contrastRatio([0, 0, 0], hover));
  return white >= 4.5 || white >= black ? "#FFFFFF" : "#000000";
}

/** Style inline pour prévisualiser une marque dans un bloc [data-theme-scope]. */
export function brandScopeStyle(hex: string): CSSProperties {
  return { "--brand-color": hex, "--color-on-primary": pickOnColor(hex) } as CSSProperties;
}

/** Script inline à placer dans <head> (exécuté avant le premier rendu). */
export function themeBootScript(options: { fallback?: string } = {}): string {
  return `try{(${bootTheme.toString()})(${JSON.stringify({ fallback: options.fallback || DEFAULT_BRAND_COLOR, scanDom: false })})}catch(e){}`;
}
