"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";
import { products } from "@/lib/demo-data";

const STORAGE_KEY = "mybigmarket-favorites-v1";

type FavoritesContextValue = {
  favorites: DemoProduct[];
  count: number;
  isFavorite: (slug: string) => boolean;
  toggle: (product: DemoProduct) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(saved)) {
          setSlugs(saved.filter((slug): slug is string => typeof slug === "string" && products.some((product) => product.slug === slug)));
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

  const favorites = useMemo(() => slugs.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is DemoProduct => Boolean(product)), [slugs]);
  const isFavorite = useCallback((slug: string) => slugs.includes(slug), [slugs]);
  const toggle = useCallback((product: DemoProduct) => {
    setSlugs((current) => current.includes(product.slug) ? current.filter((slug) => slug !== product.slug) : [...current, product.slug]);
  }, []);
  const remove = useCallback((slug: string) => setSlugs((current) => current.filter((item) => item !== slug)), []);
  const clear = useCallback(() => setSlugs([]), []);
  const value = useMemo(() => ({ favorites, count: favorites.length, isFavorite, toggle, remove, clear }), [favorites, isFavorite, toggle, remove, clear]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites doit être utilisé dans FavoritesProvider");
  return value;
}

export function FavoriteToggleButton({ product, showLabel = false }: { product: DemoProduct; showLabel?: boolean }) {
  const { isFavorite, toggle } = useFavorites();
  const selected = isFavorite(product.slug);
  const label = selected ? "Retirer des favoris" : "Ajouter aux favoris";
  return <button className={`favorite-toggle${showLabel ? " favorite-toggle-labeled" : ""}${selected ? " is-selected" : ""}`} type="button" onClick={() => toggle(product)} aria-label={`${label} : ${product.title}`} aria-pressed={selected} title={label}><Heart size={15} fill={selected ? "currentColor" : "none"}/>{showLabel && <span>{selected ? "Retirer des favoris" : "Ajouter aux favoris"}</span>}</button>;
}
