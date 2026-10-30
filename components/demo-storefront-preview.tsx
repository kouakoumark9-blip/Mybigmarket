"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, MapPin, Star, Store } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { products as demoProducts } from "@/lib/demo-data";
import type { MockStorefront } from "@/lib/demo-backend";

export function DemoStorefrontPreview({ sellerId }: { sellerId: string }) {
  const [store, setStore] = useState<MockStorefront | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/demo-backend/storefront?sellerId=${encodeURIComponent(sellerId)}`, { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Vitrine indisponible."); return payload.storefront as MockStorefront; })
      .then((value) => { if (active) setStore(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Erreur de chargement."); });
    return () => { active = false; };
  }, [sellerId]);
  if (error) return <main className="shell page-space"><div className="form-error">{error}</div><Link className="button button-outline" href="/demo-backend">Retour au back-office</Link></main>;
  if (!store) return <main className="shell page-space"><p className="page-subtitle">Chargement de la vitrine fictive…</p></main>;
  const sellerSlug = store.sellerId === "seller-aya" ? "aya-t" : "lina-k";
  const catalog = demoProducts.filter((product) => product.sellerSlug === sellerSlug);
  return <main className="shell page-space public-storefront-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><Link href="/demo-backend">Simulation du backend</Link><span>›</span><span>{store.storeName}</span></div>
    <Link className="back-link" href="/demo-backend"><ArrowLeft size={15}/> Retour au back-office</Link>
    {store.announcement && <div className="storefront-announcement"><Store size={15}/>{store.announcement}</div>}
    <section className="public-storefront-hero"><div className="public-storefront-monogram">{store.storeName.slice(0, 2).toUpperCase()}</div><div className="public-storefront-copy"><span className="eyebrow">VITRINE FICTIVE · APERÇU VENDEUR</span><h1>{store.storeName} <BadgeCheck size={20}/></h1><h2>{store.headline}</h2><p>{store.description}</p><div className="public-storefront-meta"><span><MapPin size={14}/>{store.city}, Chine · {store.university}</span><span><Star size={14} fill="currentColor"/>{store.rating.toFixed(1)} · note de démonstration</span><span><Store size={14}/>{catalog.length} produits</span></div></div></section>
    {!store.isPublished && <div className="demo-backend-warning"><Store size={16}/>Cette boutique est en brouillon et n’est pas publiable pour les acheteurs dans cette simulation.</div>}
    <div className="section-heading storefront-products-heading"><div><span className="eyebrow">CATALOGUE DU VENDEUR</span><h2>Produits présentés</h2></div><span className="storefront-product-count">{catalog.length} offres</span></div>
    <div className="catalog-grid">{catalog.map((product) => <ProductCard key={product.slug} product={product}/>)}</div>
    <div className="storefront-trust-note"><BadgeCheck size={16}/><span>Présentation de démonstration. Prix, stock, vendeur et conditions de transport ne sont pas vérifiés.</span></div>
  </main>;
}
