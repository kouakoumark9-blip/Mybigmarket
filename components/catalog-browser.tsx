"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Star, RotateCcw } from "lucide-react";
import { categories, type DemoProduct } from "@/lib/demo-data";
import { ProductCard } from "@/components/product-card";

const sortOptions = [
  { value: "featured", label: "Pertinence" },
  { value: "popular", label: "Popularité" },
  { value: "rating", label: "Mieux notés" },
  { value: "price-up", label: "Prix croissant" },
  { value: "price-down", label: "Prix décroissant" },
  { value: "delay", label: "Délai le plus court" },
];

export function CatalogBrowser({ products, initialQuery, initialCategory, initialMin, initialMax }: { products: DemoProduct[]; initialQuery: string; initialCategory: string; initialMin: string; initialMax: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [minPrice, setMinPrice] = useState(initialMin);
  const [maxPrice, setMaxPrice] = useState(initialMax);
  const [maxDays, setMaxDays] = useState(0);
  const [maxMinimum, setMaxMinimum] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [seller, setSeller] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sellerOptions = useMemo(() => Array.from(new Map(products.map((product) => [product.sellerSlug, product.seller])).entries()), [products]);
  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      const searchable = `${product.title} ${product.category} ${product.seller}`.toLocaleLowerCase("fr");
      return (!query || searchable.includes(query.toLocaleLowerCase("fr")))
        && (!category || product.categorySlug === category)
        && (!minPrice || product.priceXof >= Number(minPrice))
        && (!maxPrice || product.priceXof <= Number(maxPrice))
        && (!maxDays || product.leadTimeDays <= maxDays)
        && (!maxMinimum || product.minimumQuantity <= maxMinimum)
        && (!minRating || product.rating >= minRating)
        && (!seller || product.sellerSlug === seller)
        && (!availableOnly || product.quantity > 0);
    });
    if (sort === "price-up") result.sort((a, b) => a.priceXof - b.priceXof);
    if (sort === "price-down") result.sort((a, b) => b.priceXof - a.priceXof);
    if (sort === "delay") result.sort((a, b) => a.leadTimeDays - b.leadTimeDays);
    if (sort === "rating") result.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    if (sort === "popular") result.sort((a, b) => b.reviewCount - a.reviewCount);
    return result;
  }, [products, query, category, minPrice, maxPrice, maxDays, maxMinimum, minRating, seller, availableOnly, sort]);

  const activeFilterCount = [category, minPrice, maxPrice, maxDays > 0, maxMinimum > 0, minRating > 0, seller, availableOnly].filter(Boolean).length;
  const clearFilters = () => {
    setCategory(""); setMinPrice(""); setMaxPrice(""); setMaxDays(0); setMaxMinimum(0); setMinRating(0); setSeller(""); setAvailableOnly(false);
  };

  return <div className="catalog-layout">
    {filtersOpen && <button className="catalog-filter-backdrop" type="button" aria-label="Fermer les filtres" onClick={() => setFiltersOpen(false)}/>}
    <aside id="catalog-filter-panel" className={`filter-panel ${filtersOpen ? "is-mobile-open" : ""}`} aria-label="Filtres du catalogue">
      <div className="filter-panel-heading"><h2><SlidersHorizontal size={17}/> Filtrer les produits{activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}</h2><button className="filter-panel-close" type="button" aria-label="Fermer les filtres" onClick={() => setFiltersOpen(false)}><X size={20}/></button></div>

      <div className="filter-group"><b>Catégorie</b>
        {categories.map((item) => {
          const count = products.filter((product) => product.categorySlug === item.slug).length;
          return <label className="filter-option" key={item.slug}><input type="checkbox" checked={category === item.slug} onChange={() => setCategory(category === item.slug ? "" : item.slug)}/><span>{item.name}</span><small>{count}</small></label>;
        })}
      </div>

      <div className="filter-group"><b>Prix (FCFA)</b><div className="price-inputs"><label><span>Min.</span><input type="number" min="0" inputMode="numeric" placeholder="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)}/></label><label><span>Max.</span><input type="number" min="0" inputMode="numeric" placeholder="Illimité" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)}/></label></div></div>

      <div className="filter-group"><b>Délai estimé</b><select aria-label="Filtrer par délai estimé" value={maxDays} onChange={(event) => setMaxDays(Number(event.target.value))}><option value="0">Tous les délais</option><option value="30">30 jours maximum</option><option value="35">35 jours maximum</option><option value="40">40 jours maximum</option><option value="45">45 jours maximum</option></select></div>

      <div className="filter-group"><b>Quantité minimum</b><select aria-label="Filtrer par quantité minimale" value={maxMinimum} onChange={(event) => setMaxMinimum(Number(event.target.value))}><option value="0">Toutes les quantités</option><option value="1">1 unité maximum</option><option value="2">Jusqu’à 2 unités</option><option value="3">Jusqu’à 3 unités</option><option value="5">Jusqu’à 5 unités</option></select></div>

      <div className="filter-group"><b>Note des vendeurs</b>
        {[4.5, 4, 3.5].map((rating) => <label className="filter-option filter-rating-option" key={rating}><input type="radio" name="rating-filter" checked={minRating === rating} onChange={() => setMinRating(minRating === rating ? 0 : rating)}/><span><span className="rating-stars"><Star size={12} fill="currentColor"/> {rating.toFixed(1)}+</span></span></label>)}
      </div>

      <div className="filter-group"><b>Vendeur</b><select aria-label="Filtrer par vendeur" value={seller} onChange={(event) => setSeller(event.target.value)}><option value="">Tous les vendeurs</option>{sellerOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></div>

      <div className="filter-group filter-stock-group"><label className="filter-option"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)}/><span>En stock uniquement</span></label></div>

      <div className="filter-panel-actions"><button className="filter-clear-button" type="button" onClick={clearFilters}><RotateCcw size={14}/> Effacer les filtres</button><button className="filter-apply-button" type="button" onClick={() => setFiltersOpen(false)}>Afficher {filtered.length} produit{filtered.length === 1 ? "" : "s"}</button></div>
    </aside>

    <section className="catalog-results" aria-label="Résultats du catalogue">
      <div className="catalog-toolbar">
        <span className="catalog-results-count"><b>{filtered.length}</b> produit{filtered.length === 1 ? "" : "s"} trouvé{filtered.length === 1 ? "" : "s"}</span>
        <div className="catalog-mobile-controls">
          <button type="button" className="mobile-filter-toggle" aria-controls="catalog-filter-panel" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={15}/><span>Filtres</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
          <label htmlFor="catalog-sort">Trier par</label><select id="catalog-sort" className="catalog-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>
      </div>

      <div className="catalog-toolbar catalog-search"><Search size={16}/><input aria-label="Rechercher dans le catalogue" placeholder="Rechercher un produit ou un vendeur..." value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery("")}><X size={15}/></button>}</div>

      {activeFilterCount > 0 && <div className="active-filter-chips" aria-label="Filtres actifs">
        {category && <button type="button" onClick={() => setCategory("")}>{categories.find((item) => item.slug === category)?.name}<X size={12}/></button>}
        {(minPrice || maxPrice) && <button type="button" onClick={() => { setMinPrice(""); setMaxPrice(""); }}>Prix{minPrice ? ` ≥ ${minPrice}` : ""}{maxPrice ? ` ≤ ${maxPrice}` : ""} FCFA<X size={12}/></button>}
        {maxDays > 0 && <button type="button" onClick={() => setMaxDays(0)}>≤ {maxDays} jours<X size={12}/></button>}
        {maxMinimum > 0 && <button type="button" onClick={() => setMaxMinimum(0)}>MOQ ≤ {maxMinimum}<X size={12}/></button>}
        {minRating > 0 && <button type="button" onClick={() => setMinRating(0)}>Note ≥ {minRating}<X size={12}/></button>}
        {seller && <button type="button" onClick={() => setSeller("")}>{sellerOptions.find(([slug]) => slug === seller)?.[1]}<X size={12}/></button>}
        {availableOnly && <button type="button" onClick={() => setAvailableOnly(false)}>En stock<X size={12}/></button>}
        <button type="button" className="clear-active-filters" onClick={clearFilters}>Tout effacer</button>
      </div>}

      {filtered.length ? <div className="catalog-grid">{filtered.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="empty-state"><Search size={28}/><h3>Aucun produit trouvé</h3><p>Modifiez ou effacez quelques filtres pour voir plus d’offres.</p><button className="button button-outline" onClick={() => { clearFilters(); setQuery(""); }}>Effacer les filtres</button></div>}
    </section>
  </div>;
}
