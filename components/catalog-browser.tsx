"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { categories, type DemoProduct } from "@/lib/demo-data";
import { ProductCard } from "@/components/product-card";

export function CatalogBrowser({ products, initialQuery, initialCategory, initialMin, initialMax }: { products: DemoProduct[]; initialQuery: string; initialCategory: string; initialMin: string; initialMax: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [minPrice, setMinPrice] = useState(initialMin);
  const [maxPrice, setMaxPrice] = useState(initialMax);
  const [maxDays, setMaxDays] = useState(0);
  const [maxMinimum, setMaxMinimum] = useState(0);
  const [sort, setSort] = useState("featured");
  const filtered = useMemo(() => { const result = products.filter((product) => {
    const searchable = `${product.title} ${product.category} ${product.seller}`.toLocaleLowerCase("fr");
    return (!query || searchable.includes(query.toLocaleLowerCase("fr")))
      && (!category || product.categorySlug === category)
      && (!minPrice || product.priceXof >= Number(minPrice))
      && (!maxPrice || product.priceXof <= Number(maxPrice))
      && (!maxDays || product.leadTimeDays <= maxDays)
      && (!maxMinimum || product.minimumQuantity <= maxMinimum);
  });
    if (sort === "price-up") result.sort((a,b)=>a.priceXof-b.priceXof);
    if (sort === "price-down") result.sort((a,b)=>b.priceXof-a.priceXof);
    if (sort === "delay") result.sort((a,b)=>a.leadTimeDays-b.leadTimeDays);
    return result;
  }, [products, query, category, minPrice, maxPrice, maxDays, maxMinimum, sort]);
  return <div className="catalog-layout">
    <aside className="filter-panel"><h2><SlidersHorizontal size={15} style={{verticalAlign:"-3px",marginRight:6}}/>Filtres</h2>
      <div className="filter-group"><b>Catégorie</b>{categories.map((item) => <label key={item.slug}><input type="checkbox" checked={category === item.slug} onChange={() => setCategory(category === item.slug ? "" : item.slug)}/>{item.name}</label>)}</div>
      <div className="filter-group"><b>Prix (FCFA)</b><div className="price-inputs"><input type="number" min="0" placeholder="Min" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}/><input type="number" min="0" placeholder="Max" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}/></div></div>
      <div className="filter-group"><b>Délai estimé</b><select value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))}><option value="0">Tous les délais</option><option value="30">30 jours max.</option><option value="35">35 jours max.</option><option value="40">40 jours max.</option></select></div>
      <div className="filter-group"><b>Quantité minimum</b><select value={maxMinimum} onChange={(e) => setMaxMinimum(Number(e.target.value))}><option value="0">Toutes</option><option value="1">1 unité</option><option value="2">Jusqu’à 2</option><option value="3">Jusqu’à 3</option></select></div>
      <button className="text-link" onClick={() => {setQuery("");setCategory("");setMinPrice("");setMaxPrice("");setMaxDays(0);setMaxMinimum(0);}}>Réinitialiser les filtres</button>
    </aside>
    <section><div className="catalog-toolbar"><span><b>{filtered.length}</b> produits trouvés</span><label>Trier par　<select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="featured">En vedette</option><option value="price-up">Prix croissant</option><option value="price-down">Prix décroissant</option><option value="delay">Délai estimé</option></select></label></div>
      <div className="catalog-toolbar catalog-search"><Search size={15}/><input aria-label="Rechercher" placeholder="Rechercher dans le catalogue..." value={query} onChange={(e) => setQuery(e.target.value)}/></div>
      {filtered.length ? <div className="catalog-grid">{filtered.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <div className="empty-state"><Search size={28}/><h3>Aucun produit trouvé</h3><p>Essayez de modifier vos filtres ou votre recherche.</p></div>}
    </section>
  </div>;
}
