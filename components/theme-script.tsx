import { themeBootScript } from "@/lib/theme/brand";

/**
 * À placer dans <head> : détecte la couleur de marque (variable CSS du site
 * hôte, puis <meta name="theme-color">) avant le premier affichage, pour
 * éviter un flash de la couleur par défaut.
 *
 * NEXT_PUBLIC_BRAND_COLOR (facultatif) déclare la couleur de marque du site,
 * exactement comme si le site hôte avait écrit :root { --brand-color: … }.
 */
export function ThemeScript() {
  const brand = sanitizeColor(process.env.NEXT_PUBLIC_BRAND_COLOR);
  const scheme = `try{var s=localStorage.getItem("mybigmarket-color-scheme");if(s==="light"||s==="dark")document.documentElement.setAttribute("data-theme",s)}catch(e){}`;
  return <>
    {brand && <style>{`:root{--brand-color:${brand}}`}</style>}
    <script dangerouslySetInnerHTML={{ __html: scheme + themeBootScript() }}/>
  </>;
}

/** N'accepte qu'une valeur de couleur simple (pas d'injection CSS). */
function sanitizeColor(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch)\([\d\s.,%/a-z-]+\))$/i.test(trimmed) ? trimmed : null;
}
