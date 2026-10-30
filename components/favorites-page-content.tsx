"use client";

import Link from "next/link";
import { ArrowRight, Heart, Trash2 } from "lucide-react";
import { useFavorites } from "@/components/favorites-provider";
import { ProductCard } from "@/components/product-card";

export function FavoritesPageContent() {
  const { favorites, clear } = useFavorites();
  return <main className="shell page-space favorites-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>/</span><span>Mes favoris</span></div>
    <header className="favorites-heading"><div><span className="eyebrow">MA SÉLECTION</span><h1>Mes favoris <span>{favorites.length}</span></h1><p>Gardez les offres qui vous intéressent pour les retrouver facilement.</p></div>{favorites.length > 0 && <button className="favorites-clear" type="button" onClick={clear}><Trash2 size={15}/> Tout effacer</button>}</header>
    <p className="favorites-local-note"><Heart size={14}/> Liste conservée sur cet appareil uniquement; elle n’est pas transmise aux vendeurs.</p>
    {favorites.length ? <div className="catalog-inspired-grid favorites-grid">{favorites.map((product) => <ProductCard key={product.slug} product={product}/>)}</div> : <section className="favorites-empty"><span><Heart size={25}/></span><h2>Votre liste est vide</h2><p>Appuyez sur le cœur d’un produit pour l’ajouter ici et le comparer plus tard.</p><Link className="button button-primary" href="/produits">Explorer le catalogue <ArrowRight size={15}/></Link></section>}
  </main>;
}
