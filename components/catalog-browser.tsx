"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { categories, type DemoProduct } from "@/lib/demo-data";
import { localizedCategoryName } from "@/lib/site-locale";
import { ProductCard } from "@/components/product-card";
import { useCountryPreferences } from "@/components/country-preferences";
import { matchesSearch } from "@/lib/search";

export function CatalogBrowser({ products, initialQuery, initialCategory, initialMin, initialMax }: { products: DemoProduct[]; initialQuery: string; initialCategory: string; initialMin: string; initialMax: string }) {
  const { currency, exchangeRateReady, convertXofToLocal, text, language } = useCountryPreferences();
  const filterCurrency = exchangeRateReady ? (currency === "XOF" ? "FCFA" : currency) : "XOF";
  const sortOptions = [{ value: "featured", label: text("relevance") }, { value: "popular", label: text("popularity") }, { value: "price-up", label: text("priceAscending") }, { value: "price-down", label: text("priceDescending") }, { value: "delay", label: text("shortestLead") }];
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [minPrice, setMinPrice] = useState(initialMin);
  const [maxPrice, setMaxPrice] = useState(initialMax);
  const [maxDays, setMaxDays] = useState(0);
  const [maxMinimum, setMaxMinimum] = useState(0);
  const [seller, setSeller] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sellerOptions = useMemo(() => Array.from(new Map(products.map((product) => [product.sellerSlug, product.seller])).entries()), [products]);
  const filtered = useMemo(() => {
    const result = products.filter((product) => {
      // Sans accents ni casse, chaque mot doit figurer : « telephone sans fil » trouve « Téléphone… sans fil ».
      return matchesSearch(`${product.title} ${product.category} ${product.seller}`, query)
        && (!category || product.categorySlug === category)
        && (!minPrice || convertXofToLocal(product.priceXof) >= Number(minPrice))
        && (!maxPrice || convertXofToLocal(product.priceXof) <= Number(maxPrice))
        && (!maxDays || product.leadTimeDays <= maxDays)
        && (!maxMinimum || product.minimumQuantity <= maxMinimum)
        && (!seller || product.sellerSlug === seller)
        && (!availableOnly || product.quantity > 0);
    });
    if (sort === "price-up") result.sort((a, b) => a.priceXof - b.priceXof);
    if (sort === "price-down") result.sort((a, b) => b.priceXof - a.priceXof);
    if (sort === "delay") result.sort((a, b) => a.leadTimeDays - b.leadTimeDays);
    if (sort === "popular") result.sort((a, b) => b.reviewCount - a.reviewCount);
    return result;
  }, [products, query, category, minPrice, maxPrice, maxDays, maxMinimum, seller, availableOnly, sort, convertXofToLocal]);

  const activeFilterCount = [category, minPrice, maxPrice, maxDays > 0, maxMinimum > 0, seller, availableOnly].filter(Boolean).length;
  const clearFilters = () => {
    setCategory(""); setMinPrice(""); setMaxPrice(""); setMaxDays(0); setMaxMinimum(0); setSeller(""); setAvailableOnly(false);
  };

  return <div className="catalog-layout">
    {filtersOpen && <button className="catalog-filter-backdrop" type="button" aria-label={text("close")} onClick={() => setFiltersOpen(false)}/>}
    <aside id="catalog-filter-panel" className={`filter-panel ${filtersOpen ? "is-mobile-open" : ""}`} aria-label={text("filterProducts")}>
      <div className="filter-panel-heading"><h2><SlidersHorizontal size={17}/> {text("filterProducts")}{activeFilterCount > 0 && <span className="filter-count-badge">{activeFilterCount}</span>}</h2><button className="filter-panel-close" type="button" aria-label={text("close")} onClick={() => setFiltersOpen(false)}><X size={20}/></button></div>

      <div className="filter-group"><b>{text("category")}</b>
        {categories.map((item) => {
          const count = products.filter((product) => product.categorySlug === item.slug).length;
          return <label className="filter-option" key={item.slug}><input type="checkbox" checked={category === item.slug} onChange={() => setCategory(category === item.slug ? "" : item.slug)}/><span>{localizedCategoryName(item.slug, language, item.name)}</span><small>{count}</small></label>;
        })}
      </div>

      <div className="filter-group"><b>{text("price")} ({filterCurrency})</b><div className="price-inputs"><label><span>{text("min")}</span><input type="number" min="0" inputMode="numeric" placeholder="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)}/></label><label><span>{text("max")}</span><input type="number" min="0" inputMode="numeric" placeholder={text("unlimited")} value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)}/></label></div></div>

      <div className="filter-group"><b>{text("estimatedTime")}</b><select aria-label={text("estimatedTime")} value={maxDays} onChange={(event) => setMaxDays(Number(event.target.value))}><option value="0">{text("allTimes")}</option><option value="30">{text("max30")}</option><option value="35">{text("max35")}</option><option value="40">{text("max40")}</option><option value="45">{text("max45")}</option></select></div>

      <div className="filter-group"><b>{text("minOrderQty")}</b><select aria-label={text("minOrderQty")} value={maxMinimum} onChange={(event) => setMaxMinimum(Number(event.target.value))}><option value="0">{text("allQuantities")}</option><option value="1">{text("maxOne")}</option><option value="2">{text("upToTwo")}</option><option value="3">{text("upToThree")}</option><option value="5">{text("upToFive")}</option></select></div>

      <div className="filter-group"><b>{text("seller")}</b><select aria-label="Filtrer par vendeur" value={seller} onChange={(event) => setSeller(event.target.value)}><option value="">{text("allSellers")}</option>{sellerOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></div>

      <div className="filter-group filter-stock-group"><label className="filter-option"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)}/><span>{text("inStockOnly")}</span></label></div>

      <div className="filter-panel-actions"><button className="filter-clear-button" type="button" onClick={clearFilters}><RotateCcw size={14}/> {text("clearFilters")}</button><button className="filter-apply-button" type="button" onClick={() => setFiltersOpen(false)}>{text("showProducts")} ({filtered.length})</button></div>
    </aside>

    <section className="catalog-results" aria-label={text("catalog")}>
      <div className="catalog-toolbar">
        <span className="catalog-results-count"><b>{filtered.length}</b> {text(filtered.length === 1 ? "productFound" : "productsFound")}</span>
        <div className="catalog-mobile-controls">
          <button type="button" className="mobile-filter-toggle" aria-controls="catalog-filter-panel" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={15}/><span>{text("filters")}</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
          <label htmlFor="catalog-sort">{text("sortBy")}</label><select id="catalog-sort" className="catalog-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        </div>
      </div>

      <div className="catalog-toolbar catalog-search"><Search size={16}/><input aria-label={text("searchProducts")} placeholder={text("searchProducts")} value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button type="button" aria-label={text("clearSearch")} onClick={() => setQuery("")}><X size={15}/></button>}</div>

      {activeFilterCount > 0 && <div className="active-filter-chips" aria-label={text("filters")}>
        {category && <button type="button" onClick={() => setCategory("")}>{localizedCategoryName(category, language, categories.find((item) => item.slug === category)?.name || category)}<X size={12}/></button>}
        {(minPrice || maxPrice) && <button type="button" onClick={() => { setMinPrice(""); setMaxPrice(""); }}>{text("price")}{minPrice ? ` ≥ ${minPrice}` : ""}{maxPrice ? ` ≤ ${maxPrice}` : ""} {filterCurrency}<X size={12}/></button>}
        {maxDays > 0 && <button type="button" onClick={() => setMaxDays(0)}>≤ {maxDays} {text("estimatedTime")}<X size={12}/></button>}
        {maxMinimum > 0 && <button type="button" onClick={() => setMaxMinimum(0)}>MOQ ≤ {maxMinimum}<X size={12}/></button>}
        {seller && <button type="button" onClick={() => setSeller("")}>{sellerOptions.find(([slug]) => slug === seller)?.[1]}<X size={12}/></button>}
        {availableOnly && <button type="button" onClick={() => setAvailableOnly(false)}>{text("inStockOnly")}<X size={12}/></button>}
        <button type="button" className="clear-active-filters" onClick={clearFilters}>{text("clearFilters")}</button>
      </div>}

      {filtered.length ? <div className="catalog-grid">{filtered.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="empty-state"><Search size={28}/><h3>{text("noProductsFound")}</h3><p>{text("adjustFilters")}</p><button className="button button-outline" onClick={() => { clearFilters(); setQuery(""); }}>{text("clearFilters")}</button></div>}
    </section>
  </div>;
}
