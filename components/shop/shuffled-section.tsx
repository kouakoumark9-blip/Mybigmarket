"use client";

import { useEffect, useState } from "react";
import type { ShopProduct } from "@/lib/shop/types";
import { ProductSection } from "./product-section";

/** Choisit `count` produits au hasard dans la liste, puis les remet du moins cher au plus cher. */
export function pickVaried(pool: ShopProduct[], count: number, random: () => number = Math.random): ShopProduct[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count).sort((a, b) => a.priceXof - b.priceXof);
}

/**
 * Section dont les produits changent à chaque visite parmi une réserve (par exemple les moins chers).
 * Le serveur envoie les premiers (page stable pour Google) ; le navigateur en tire ensuite d'autres au hasard.
 */
export function ShuffledSection({ title, href, pool, count }: { title: string; href?: string; pool: ShopProduct[]; count: number }) {
  const [items, setItems] = useState(() => pool.slice(0, count));
  useEffect(() => {
    if (pool.length <= count) return;
    const timer = window.setTimeout(() => setItems(pickVaried(pool, count)), 0);
    return () => window.clearTimeout(timer);
  }, [pool, count]);
  return <ProductSection title={title} href={href} products={items}/>;
}
