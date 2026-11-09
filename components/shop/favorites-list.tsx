"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFavorites } from "@/components/favorites-provider";
import type { ShopProduct } from "@/lib/shop/types";
import { ProductGrid } from "./product-card";

export function FavoritesList() {
  const { favorites } = useFavorites();
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const key = favorites.map((item) => item.slug).join(",");

  useEffect(() => {
    if (!key) { const timer = window.setTimeout(() => setItems([]), 0); return () => window.clearTimeout(timer); }
    let cancelled = false;
    fetch(`/api/boutique/produits?slugs=${encodeURIComponent(key)}`).then((response) => response.json() as Promise<{ items: ShopProduct[] }>)
      .then((payload) => { if (!cancelled) setItems(payload.items); }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [key]);

  if (items === null) return <p className="mb-empty">Chargement…</p>;
  if (!items.length) return <div className="mb-section"><p className="mb-empty">Aucun favori pour le moment. <Link className="mb-link" href="/produits">Voir tous les produits</Link></p></div>;
  return <ProductGrid products={items}/>;
}
