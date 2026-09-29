"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DemoProduct } from "@/lib/demo-data";

type CartLine = DemoProduct & { qty: number };
type CartContextValue = {
  items: CartLine[];
  count: number;
  total: number;
  notice: string;
  addItem: (product: DemoProduct, quantity?: number) => void;
  setQuantity: (slug: string, quantity: number) => void;
  removeItem: (slug: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "mybigmarket-cart-v1";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let saved: CartLine[] = [];
    try {
      const value = localStorage.getItem(KEY);
      if (value) saved = JSON.parse(value) as CartLine[];
    } catch {
      localStorage.removeItem(KEY);
    }
    const timer = window.setTimeout(() => { setItems(saved); setHydrated(true); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const addItem = useCallback((product: DemoProduct, quantity = product.minimumQuantity) => {
    const safeQty = Math.max(product.minimumQuantity, Math.floor(quantity));
    setItems((current) => {
      const existing = current.find((item) => item.slug === product.slug);
      if (existing) return current.map((item) => item.slug === product.slug ? { ...item, qty: Math.min(item.quantity, item.qty + safeQty) } : item);
      return [...current, { ...product, qty: Math.min(product.quantity, safeQty) }];
    });
    showNotice(`${product.title} ajouté au panier`);
  }, [showNotice]);

  const setQuantity = useCallback((slug: string, quantity: number) => {
    setItems((current) => current.map((item) => item.slug === slug ? { ...item, qty: Math.max(item.minimumQuantity, Math.min(item.quantity, Math.floor(quantity))) } : item));
  }, []);

  const removeItem = useCallback((slug: string) => setItems((current) => current.filter((item) => item.slug !== slug)), []);
  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    count: items.reduce((sum, item) => sum + item.qty, 0),
    total: items.reduce((sum, item) => sum + item.qty * item.priceXof, 0),
    notice, addItem, setQuantity, removeItem, clearCart,
  }), [items, notice, addItem, setQuantity, removeItem, clearCart]);

  return <CartContext.Provider value={value}>{children}{notice && <div className="toast" role="status">✓ {notice}</div>}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart doit être utilisé dans CartProvider");
  return value;
}
