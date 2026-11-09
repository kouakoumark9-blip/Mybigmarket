"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { DemoProduct } from "@/lib/demo-data";

const STORAGE_KEY = "mybigmarket-favorites-v2";

type FavoritesContextValue = {
  favorites: DemoProduct[];
  count: number;
  isFavorite: (slug: string) => boolean;
  toggle: (product: DemoProduct) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/** Favoris du visiteur : enregistrés dans son navigateur (aucun compte nécessaire). */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<DemoProduct[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(saved)) setFavorites(saved.filter((item): item is DemoProduct => Boolean(item) && typeof (item as DemoProduct).slug === "string"));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [hydrated, favorites]);

  const isFavorite = useCallback((slug: string) => favorites.some((item) => item.slug === slug), [favorites]);
  const toggle = useCallback((product: DemoProduct) => {
    setFavorites((current) => current.some((item) => item.slug === product.slug) ? current.filter((item) => item.slug !== product.slug) : [...current, product]);
  }, []);
  const remove = useCallback((slug: string) => setFavorites((current) => current.filter((item) => item.slug !== slug)), []);
  const clear = useCallback(() => setFavorites([]), []);
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
