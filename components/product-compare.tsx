"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Scale, X } from "lucide-react";
import { formatXof, products, type DemoProduct } from "@/lib/demo-data";

const STORAGE_KEY = "mybigmarket-compare-v1";
const MAX_COMPARE = 3;

type CompareContextValue = {
  selected: DemoProduct[];
  isSelected: (slug: string) => boolean;
  isFull: boolean;
  toggle: (product: DemoProduct) => void;
  remove: (slug: string) => void;
  clear: () => void;
  openComparison: () => void;
};

const CompareContext = createContext<CompareContextValue | null>(null);

export function ProductCompareProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(saved)) {
          setSlugs(saved.filter((slug): slug is string => typeof slug === "string" && products.some((product) => product.slug === slug)).slice(0, MAX_COMPARE));
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  }, [hydrated, slugs]);

  const selected = useMemo(() => slugs.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is DemoProduct => Boolean(product)), [slugs]);
  const isSelected = useCallback((slug: string) => slugs.includes(slug), [slugs]);
  const toggle = useCallback((product: DemoProduct) => {
    setSlugs((current) => current.includes(product.slug)
      ? current.filter((slug) => slug !== product.slug)
      : current.length >= MAX_COMPARE ? current : [...current, product.slug]);
  }, []);
  const remove = useCallback((slug: string) => setSlugs((current) => current.filter((item) => item !== slug)), []);
  const clear = useCallback(() => { setSlugs([]); setIsOpen(false); }, []);
  const openComparison = useCallback(() => { if (selected.length >= 2) setIsOpen(true); }, [selected.length]);
  const value = useMemo(() => ({ selected, isSelected, isFull: selected.length >= MAX_COMPARE, toggle, remove, clear, openComparison }), [selected, isSelected, toggle, remove, clear, openComparison]);

  return <CompareContext.Provider value={value}>
    {children}
    {selected.length > 0 && <aside className="compare-tray" aria-label="Comparateur de produits">
      <div className="compare-tray-heading"><Scale size={18}/><span><b>Comparer les offres</b><small>{selected.length < 2 ? "Ajoutez un deuxième produit" : `${selected.length} produits sélectionnés · max. ${MAX_COMPARE}`}</small></span></div>
      <div className="compare-tray-items">{selected.map((product) => <span className="compare-chip" key={product.slug} title={product.title}>{product.title}<button type="button" onClick={() => remove(product.slug)} aria-label={`Retirer ${product.title} de la comparaison`}><X size={13}/></button></span>)}</div>
      <button className="compare-open button button-primary" type="button" onClick={openComparison} disabled={selected.length < 2}><Scale size={15}/> Comparer ({selected.length})</button>
      <button className="compare-clear" type="button" onClick={clear} aria-label="Vider la sélection de comparaison">Tout effacer</button>
    </aside>}
    {isOpen && selected.length >= 2 && <div className="compare-modal-backdrop" onClick={() => setIsOpen(false)}>
      <section className="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title" onClick={(event) => event.stopPropagation()}>
        <header className="compare-modal-header"><div><span className="eyebrow">ACHAT B2B · COMPARAISON</span><h2 id="compare-title">Comparez les offres</h2><p>Prix, minimum de commande et informations vendeur côte à côte.</p></div><button className="compare-close" type="button" onClick={() => setIsOpen(false)} aria-label="Fermer la comparaison"><X size={20}/></button></header>
        <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">Critère</th>{selected.map((product) => <th scope="col" key={product.slug}><Link href={`/produits/${product.slug}`} onClick={() => setIsOpen(false)}>{product.title}</Link><small>{product.category}</small></th>)}</tr></thead><tbody>
          <tr><th scope="row">Prix unitaire</th>{selected.map((product) => <td className="compare-price" key={product.slug}>{formatXof(product.priceXof)}</td>)}</tr>
          <tr><th scope="row">Commande minimum</th>{selected.map((product) => <td key={product.slug}>{product.minimumQuantity} unité{product.minimumQuantity > 1 ? "s" : ""}</td>)}</tr>
          <tr><th scope="row">Délai estimé</th>{selected.map((product) => <td key={product.slug}>{product.leadTimeDays} j</td>)}</tr>
          <tr><th scope="row">Stock indicatif</th>{selected.map((product) => <td key={product.slug}>{product.quantity} unités</td>)}</tr>
          <tr><th scope="row">Note (démo)</th>{selected.map((product) => <td key={product.slug}>{product.rating.toFixed(1)} / 5 · {product.reviewCount} avis</td>)}</tr>
          <tr><th scope="row">Vendeur</th>{selected.map((product) => <td key={product.slug}><Link href={`/vendeurs/${product.sellerSlug}`} onClick={() => setIsOpen(false)}>{product.seller}</Link><small>{product.university}</small></td>)}</tr>
          <tr><th scope="row">Ville de départ</th>{selected.map((product) => <td key={product.slug}>{product.city}, Chine</td>)}</tr>
          <tr><th scope="row">Action</th>{selected.map((product) => <td key={product.slug}><Link className="compare-product-link" href={`/produits/${product.slug}`} onClick={() => setIsOpen(false)}>Voir la fiche <span aria-hidden="true">→</span></Link></td>)}</tr>
        </tbody></table></div>
        <p className="compare-disclaimer">Démonstration : prix, stock, avis et délais sont indicatifs et doivent être confirmés avec le vendeur. La sélection est conservée sur cet appareil uniquement.</p>
      </section>
    </div>}
  </CompareContext.Provider>;
}

export function CompareProductButton({ product, showLabel = false }: { product: DemoProduct; showLabel?: boolean }) {
  const context = useContext(CompareContext);
  if (!context) throw new Error("CompareProductButton doit être utilisé dans ProductCompareProvider");
  const selected = context.isSelected(product.slug);
  const disabled = context.isFull && !selected;
  const label = selected ? "Retirer de la comparaison" : disabled ? "Maximum de trois produits" : "Ajouter à la comparaison";
  return <button className={`compare-toggle${showLabel ? " compare-toggle-labeled" : ""}${selected ? " is-selected" : ""}`} type="button" onClick={() => context.toggle(product)} aria-label={`${label} : ${product.title}`} aria-pressed={selected} title={label} disabled={disabled}><Scale size={15}/>{showLabel && <span>{selected ? "Retirer de la comparaison" : "Comparer cette offre"}</span>}</button>;
}
