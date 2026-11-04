"use client";

import { useState } from "react";
import { AlertCircle, Check, MessageCircle, Moon, Monitor, Palette, ShoppingCart, Star, Sun, Truck } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { BRAND_PRESETS, brandScopeStyle } from "@/lib/theme/brand";

const SOURCE_LABELS = {
  "css-variable": "variable CSS --brand-color / --primary",
  "meta-theme-color": "balise <meta name=\"theme-color\">",
  dom: "bouton ou lien principal du site",
  default: "valeur par défaut",
  manual: "choix manuel",
} as const;

/**
 * Démonstration : aucun composant ci-dessous ne contient de couleur.
 * Tout passe par les utilitaires Tailwind mappés sur les variables CSS
 * (bg-primary, text-on-primary, bg-primary-soft, border-border, …).
 */
export function ThemeDemo() {
  const { theme, setBrandColor, resetBrandColor, colorScheme, setColorScheme } = useTheme();
  const [custom, setCustom] = useState("");

  return <main className="shell page-space">
    <section className="rounded-3xl border border-border bg-surface p-6 shadow-xs md:p-10">
      <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary-strong"><Palette size={16} strokeWidth={1.75}/> Thème dynamique</p>
      <h1 className="mt-2 text-3xl font-bold text-text md:text-4xl">Une seule couleur pilote toute la page</h1>
      <p className="mt-3 max-w-2xl text-text-muted">Cliquez sur un thème : seule la variable <code className="rounded-md bg-surface-2 px-1.5 py-0.5">--brand-color</code> change sur <code className="rounded-md bg-surface-2 px-1.5 py-0.5">&lt;html&gt;</code>. Survol, fond clair, texte lisible et focus sont recalculés automatiquement, sur tout le site.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {BRAND_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => setBrandColor(preset.value)} data-theme-scope="" style={brandScopeStyle(preset.value)} className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-primary px-5 font-semibold text-on-primary shadow-xs transition-colors hover:bg-primary-hover">
          {theme?.color === preset.value.toUpperCase() && <Check size={16} strokeWidth={2}/>}{preset.label} <span className="font-mono text-xs opacity-80">{preset.value}</span>
        </button>)}
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (custom.trim()) setBrandColor(custom.trim()); }}>
          <label htmlFor="brand-custom" className="sr-only">Couleur personnalisée</label>
          <input id="brand-custom" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="#8B5CF6, hsl(…)…" className="min-h-11 w-44 rounded-pill border border-border-strong bg-surface px-4 text-text"/>
          <button type="submit" className="min-h-11 rounded-pill border border-primary px-5 font-semibold text-primary-strong transition-colors hover:bg-primary-soft">Appliquer</button>
        </form>
        <button type="button" onClick={resetBrandColor} className="min-h-11 rounded-pill px-4 font-medium text-text-muted underline-offset-4 hover:underline">Détection auto</button>
      </div>

      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-2xl bg-surface-2 p-4"><dt className="text-text-muted">--brand-color</dt><dd className="mt-1 font-mono text-lg font-semibold text-text">{theme?.color ?? "…"}</dd></div>
        <div className="rounded-2xl bg-surface-2 p-4"><dt className="text-text-muted">Texte sur primaire</dt><dd className="mt-1 font-semibold text-text">{theme ? `${theme.onPrimary === "#FFFFFF" ? "blanc" : "noir"} · contraste ${theme.contrast}:1` : "…"}</dd></div>
        <div className="rounded-2xl bg-surface-2 p-4"><dt className="text-text-muted">Source détectée</dt><dd className="mt-1 font-semibold text-text">{theme ? SOURCE_LABELS[theme.source] : "…"}</dd></div>
      </dl>

      <div className="mt-6 inline-flex rounded-pill border border-border bg-surface-2 p-1" role="group" aria-label="Apparence">
        {([["system", "Système", Monitor], ["light", "Clair", Sun], ["dark", "Sombre", Moon]] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={colorScheme === value} onClick={() => setColorScheme(value)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill px-4 text-sm font-medium transition-colors ${colorScheme === value ? "bg-surface text-text shadow-xs" : "text-text-muted hover:text-text"}`}><Icon size={15} strokeWidth={1.75}/>{label}</button>)}
      </div>
    </section>

    <h2 className="mt-10 text-xl font-bold text-text">Composants avec le thème actif</h2>
    <div className="mt-4 grid gap-5 md:grid-cols-2"><ProductPreview/><StatesPreview/></div>

    <h2 className="mt-10 text-xl font-bold text-text">Aperçus isolés (data-theme-scope)</h2>
    <p className="mt-1 text-text-muted">Le même composant, rendu dans trois blocs qui ne définissent chacun que <code>--brand-color</code>.</p>
    <div className="mt-4 grid gap-5 md:grid-cols-3">
      {BRAND_PRESETS.map((preset) => <div key={preset.id} data-theme-scope="" style={brandScopeStyle(preset.value)}><ProductPreview compact title={preset.label}/></div>)}
    </div>
  </main>;
}

function ProductPreview({ compact = false, title = "Casque Bluetooth à réduction de bruit" }: { compact?: boolean; title?: string }) {
  return <article className="rounded-3xl border border-border bg-surface p-5 shadow-xs">
    <span className="inline-flex rounded-pill bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-strong">Précommande groupée</span>
    <h3 className="mt-3 text-lg font-semibold text-text">{title}</h3>
    <p className="mt-2 flex items-baseline gap-2"><span className="price text-2xl text-text">12 500 FCFA</span><span className="text-sm text-text-muted">/ pièce · min. 10</span></p>
    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success"><Check size={15} strokeWidth={2}/> En stock</p>
    <p className="mt-1 flex items-center gap-0.5 text-rating" aria-label="Note 4 sur 5">{[1, 2, 3, 4].map((n) => <Star key={n} size={15} className="fill-rating" strokeWidth={1.5}/>)}<Star size={15} strokeWidth={1.5}/><span className="ml-1 text-sm text-text-muted">(128 avis)</span></p>
    <div className={`mt-4 flex gap-2 ${compact ? "flex-col" : "flex-wrap"}`}>
      <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-primary px-5 font-semibold text-on-primary transition-colors hover:bg-primary-hover"><ShoppingCart size={17} strokeWidth={1.75}/> Ajouter au panier</button>
      <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-primary px-5 font-semibold text-primary-strong transition-colors hover:bg-primary-soft">Demander un devis</button>
    </div>
  </article>;
}

function StatesPreview() {
  return <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-xs">
    <p className="text-sm font-semibold text-text-muted">Couleurs sémantiques (fixes, indépendantes du thème)</p>
    <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-pill bg-whatsapp px-5 font-semibold text-on-whatsapp"><MessageCircle size={17} strokeWidth={1.75}/> Contacter sur WhatsApp</button>
    <p className="flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"><AlertCircle size={16} strokeWidth={1.75}/> Le numéro de téléphone est invalide.</p>
    <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-medium text-success"><Check size={16} strokeWidth={1.75}/> Commande confirmée.</p>
    <p className="text-sm font-semibold text-text-muted">États de marque</p>
    <div className="flex flex-wrap gap-2">
      <span className="rounded-pill bg-primary px-3 py-1 text-sm font-semibold text-on-primary">Actif</span>
      <span className="rounded-pill bg-primary-hover px-3 py-1 text-sm font-semibold text-on-primary">Survol</span>
      <span className="rounded-pill bg-primary-soft px-3 py-1 text-sm font-semibold text-primary-strong">Fond clair</span>
      <span className="rounded-pill border border-primary-muted px-3 py-1 text-sm font-semibold text-text">Sélectionné</span>
    </div>
    <p className="flex items-center gap-2 text-sm text-text-muted"><Truck size={16} strokeWidth={1.75}/> Livraison estimée : <span className="price text-text">21 jours</span></p>
  </div>;
}
