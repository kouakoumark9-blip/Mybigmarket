import Link from "next/link";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { ProductGrid } from "./product-card";
import { formatFcfa } from "@/lib/shop/format";
import { listFilterOptions, listProducts } from "@/lib/shop/queries";
import { readFilters, withParams, type RawParams } from "@/lib/shop/search-params";
import type { ShopCategory } from "@/lib/shop/types";

const SORT_LABELS: Array<[string, string]> = [["pertinence", "Pertinence"], ["prix-croissant", "Prix croissant"], ["prix-decroissant", "Prix décroissant"], ["nouveautes", "Nouveautés"]];
const PAGE_SIZE = 20;

type Props = {
  basePath: string;
  title: string;
  intro?: string | null;
  crumbs: Crumb[];
  params: RawParams;
  categoryIds?: number[];
  flag?: "best" | "promo";
  subcategories?: ShopCategory[];
  body?: string | null;
  faq?: Array<{ question: string; answer: string }>;
};

/** Page de liste : titre, introduction, sous-catégories, filtres, tri, grille, pagination, texte explicatif et FAQ. */
export async function CatalogView({ basePath, title, intro, crumbs, params, categoryIds, flag, subcategories = [], body, faq = [] }: Props) {
  const filters = readFilters(params);
  const [{ items, total }, options] = await Promise.all([
    listProducts({ ...filters, categoryIds, flag, pageSize: PAGE_SIZE }),
    listFilterOptions(categoryIds ?? []),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const keep: RawParams = { q: filters.q, marque: filters.brand, puissance: filters.power, min: filters.minPrice?.toString(), max: filters.maxPrice?.toString(), stock: typeof params.stock === "string" ? params.stock : undefined, tri: filters.sort === "pertinence" ? undefined : filters.sort };
  const hasFilters = Boolean(filters.q || filters.brand || filters.power || filters.minPrice || filters.maxPrice || filters.stock);
  return <>
    <Breadcrumbs items={crumbs}/>
    <h1 className="mb-title">{filters.q ? `Résultats pour « ${filters.q} »` : title}</h1>
    {intro && !filters.q && <p className="mb-intro">{intro}</p>}
    {subcategories.length > 0 && <div className="mb-subcats" aria-label="Sous-catégories">{subcategories.map((child) => <Link key={child.slug} href={`/${child.slug}`}>{child.name}</Link>)}</div>}
    <div className="mb-cat-layout">
      <form className="mb-filters" method="get" action={basePath} aria-label="Filtres">
        <h2>Filtrer</h2>
        {filters.q && <input type="hidden" name="q" value={filters.q}/>}
        {options.brands.length > 0 && <div className="mb-filter"><label htmlFor="f-marque">Marque</label>
          <select id="f-marque" name="marque" className="mb-input" defaultValue={filters.brand ?? ""}><option value="">Toutes les marques</option>{options.brands.map((brand) => <option key={brand.slug} value={brand.slug}>{brand.name}</option>)}</select></div>}
        {options.powers.length > 0 && <div className="mb-filter"><label htmlFor="f-puissance">Puissance</label>
          <select id="f-puissance" name="puissance" className="mb-input" defaultValue={filters.power ?? ""}><option value="">Toutes les puissances</option>{options.powers.map((power) => <option key={power} value={power}>{power}</option>)}</select></div>}
        <div className="mb-filter"><fieldset><legend>Prix (FCFA)</legend>
          <div className="mb-row"><input className="mb-input" type="number" inputMode="numeric" min={0} name="min" placeholder="Min" aria-label="Prix minimum" defaultValue={filters.minPrice ?? ""}/><span aria-hidden="true">–</span><input className="mb-input" type="number" inputMode="numeric" min={0} name="max" placeholder={options.maxPrice ? String(options.maxPrice) : "Max"} aria-label="Prix maximum" defaultValue={filters.maxPrice ?? ""}/></div></fieldset></div>
        <div className="mb-filter"><fieldset><legend>Disponibilité</legend>
          {[["", "Tout"], ["en-stock", "En stock à Abidjan"], ["sur-commande", "Sur commande"]].map(([value, label]) => <label key={value} className="mb-check"><input type="radio" name="stock" value={value} defaultChecked={(typeof params.stock === "string" ? params.stock : "") === value}/> {label}</label>)}</fieldset></div>
        <div className="mb-filter"><label htmlFor="f-tri">Trier par</label>
          <select id="f-tri" name="tri" className="mb-input" defaultValue={filters.sort}>{SORT_LABELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="mb-filter"><button className="mb-btn mb-btn--block" type="submit">Appliquer</button>{hasFilters && <p style={{ margin: "8px 0 0", textAlign: "center" }}><Link className="mb-link" href={basePath}>Effacer les filtres</Link></p>}</div>
      </form>
      <div>
        <div className="mb-toolbar"><span>{total} produit{total > 1 ? "s" : ""}{options.maxPrice ? ` · jusqu'à ${formatFcfa(options.maxPrice)}` : ""}</span>
          <span>Trier : {SORT_LABELS.map(([value, label], index) => <span key={value}>{index > 0 && " · "}{filters.sort === value ? <b>{label}</b> : <Link className="mb-link" href={withParams(basePath, keep, { tri: value === "pertinence" ? undefined : value })}>{label}</Link>}</span>)}</span></div>
        {items.length ? <div className="mb-section" style={{ margin: 0 }}><ProductGrid products={items}/></div> : <div className="mb-section"><p className="mb-empty">Aucun produit ne correspond. <Link className="mb-link" href={basePath}>Voir toute la sélection</Link> ou écrivez-nous sur WhatsApp pour le trouver.</p></div>}
        {pages > 1 && <nav className="mb-pager" aria-label="Pagination">{Array.from({ length: pages }, (_, index) => index + 1).map((number) => number === page ? <span key={number} aria-current="page">{number}</span> : <Link key={number} href={withParams(basePath, keep, { page: number === 1 ? undefined : String(number) })}>{number}</Link>)}</nav>}
      </div>
    </div>
    {body && !hasFilters && <section className="mb-textblock"><h2>Bien choisir : {title.toLowerCase()}</h2>{body.split(/\n{2,}/).map((paragraph) => <p key={paragraph.slice(0, 40)}>{paragraph}</p>)}</section>}
    {faq.length > 0 && !hasFilters && <section className="mb-textblock mb-faq"><h2>Questions fréquentes</h2>{faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>}
  </>;
}
