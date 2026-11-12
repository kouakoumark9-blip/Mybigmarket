"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DemoProduct } from "@/lib/demo-data";

type CartLine = DemoProduct & { qty: number };
type CartContextValue = {
  items: CartLine[];
  count: number;
  total: number;
  notice: string;
  addItem: (product: DemoProduct, quantity?: number, variant?: NonNullable<DemoProduct["variants"]>[number]) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "mybigmarket-cart-v1";

/** Clé d'une ligne : le produit, et sa taille quand il en a. */
export const lineKey = (item: Pick<DemoProduct, "slug" | "variantId">) => (item.variantId ? `${item.slug}#${item.variantId}` : item.slug);

/** Un produit sur commande n'a pas de stock en boutique : on plafonne à 99 pièces par ligne. */
const stockLimit = (product: DemoProduct) => (product.availability === "on_order" ? 99 : product.quantity);

function unitPriceForQuantity(product: DemoProduct, quantity: number) {
  return product.tiers?.find((tier) => quantity >= tier.minQuantity && (tier.maxQuantity === null || quantity <= tier.maxQuantity))?.unitPriceXof ?? product.priceXof;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved: CartLine[] = [];
    try {
      const value = localStorage.getItem(KEY);
      if (value) saved = (JSON.parse(value) as CartLine[]).filter((item) => !item.isDemo);
    } catch {
      localStorage.removeItem(KEY);
    }
    // Un ajout fait avant la lecture du panier enregistré ne doit pas être écrasé : on fusionne les deux.
    const timer = window.setTimeout(() => { setItems((current) => [...current, ...saved.filter((item) => !current.some((line) => lineKey(line) === lineKey(item)))]); setHydrated(true); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const addItem = useCallback((base: DemoProduct, quantity = 1, variant?: NonNullable<DemoProduct["variants"]>[number]) => {
    if (base.variants?.length && !variant) { showNotice("Choisissez une taille."); return; }
    const product: DemoProduct = variant ? { ...base, title: `${base.title} – ${variant.label}`, priceXof: variant.priceXof, quantity: variant.quantity, variantId: variant.id, variantLabel: variant.label, variants: undefined } : base;
    if (product.isDemo) { showNotice("Ce produit n’est pas encore disponible à la commande."); return; }
    if (product.availability !== "on_order" && product.quantity < 1) { showNotice("Ce produit n’est plus en stock."); return; }
    const safeQty = Math.min(stockLimit(product), Math.max(1, Math.floor(quantity)));
    setItems((current) => {
      const existing = current.find((item) => lineKey(item) === lineKey(product));
      if (existing) {
        const combinedQuantity = Math.min(stockLimit(product), existing.qty + safeQty);
        const tierProduct = product.tiers?.length ? product : existing;
        return current.map((item) => lineKey(item) === lineKey(product) ? { ...item, ...product, qty: combinedQuantity, priceXof: unitPriceForQuantity(tierProduct, combinedQuantity) } : item);
      }
      return [...current, { ...product, priceXof: unitPriceForQuantity(product, safeQty), qty: safeQty }];
    });
    showNotice(`${product.title} ajouté au panier`);
  }, [showNotice]);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((current) => current.map((item) => {
      if (lineKey(item) !== key) return item;
      const qty = Math.max(1, Math.min(stockLimit(item), Math.floor(quantity)));
      return { ...item, qty, priceXof: unitPriceForQuantity(item, qty) };
    }));
  }, []);

  const removeItem = useCallback((key: string) => setItems((current) => current.filter((item) => lineKey(item) !== key)), []);
  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.qty, 0),
    total: items.reduce((sum, item) => sum + item.qty * item.priceXof, 0),
    notice, addItem, setQuantity, removeItem, clearCart,
  }), [items, notice, addItem, setQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}{notice && <div className="toast" role="status">{notice}</div>}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart doit être utilisé dans CartProvider");
  return value;
}
