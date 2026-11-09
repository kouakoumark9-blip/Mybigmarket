"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ChevronDown, Heart, Menu, MessageCircle, Search, ShoppingCart, Truck, X } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { SHOP, TOP_STRIP, whatsappLink } from "@/lib/shop/config";
import { Logo } from "./logo";
import { CategoryMenu } from "./category-menu";
import type { MenuCategory } from "./menu-types";

/** Bande du haut, en-tête (logo, recherche par catégorie, compte, panier, WhatsApp), menu des catégories. */
export function SiteHeader({ categories }: { categories: MenuCategory[] }) {
  const router = useRouter();
  const { count } = useCart();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [open, setOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    const params = term ? `?q=${encodeURIComponent(term)}` : "";
    router.push(category ? `/${category}${params}` : `/produits${params}`);
    setOpen(false);
  }

  return <>
    <a className="mb-skip" href="#contenu">Aller au contenu</a>
    <div className="mb-strip"><div className="mb-wrap">
      <span className="mb-strip-msg">{TOP_STRIP}</span>
      <a href={whatsappLink()} rel="noopener">{SHOP.phoneDisplay}</a>
    </div></div>
    <header className="mb-header">
      <div className="mb-wrap mb-header-main">
        <button type="button" className="mb-menu-toggle" onClick={() => setOpen(true)} aria-label="Ouvrir le menu des catégories"><Menu size={24} strokeWidth={1.75}/></button>
        <Logo/>
        <form className="mb-search" role="search" onSubmit={submit}>
          <label className="mb-sr" htmlFor="mb-cat">Catégorie</label>
          <select id="mb-cat" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <label className="mb-sr" htmlFor="mb-q">Rechercher un produit</label>
          <input id="mb-q" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un produit" autoComplete="off"/>
          <button type="submit"><Search size={18} strokeWidth={1.75} aria-hidden="true"/> Rechercher</button>
        </form>
        <div className="mb-header-actions">
          <Link className="mb-action mb-action--track" href="/suivi-commande"><Truck size={22} strokeWidth={1.75} aria-hidden="true"/><span>Suivi commande</span></Link>
          <Link className="mb-action" href="/panier" aria-label={`Panier, ${count} article${count > 1 ? "s" : ""}`}>
            <ShoppingCart size={22} strokeWidth={1.75} aria-hidden="true"/><span>Panier</span>
            {count > 0 && <span className="mb-action-count" aria-hidden="true">{count}</span>}
          </Link>
          <a className="mb-header-wa" href={whatsappLink()} rel="noopener" aria-label="WhatsApp"><MessageCircle size={20} strokeWidth={1.75} aria-hidden="true"/><span>WhatsApp</span></a>
        </div>
      </div>
      <nav className="mb-nav" aria-label="Catégories">
        <div className="mb-wrap">
          <div className="mb-nav-all">
            <button type="button"><Menu size={18} strokeWidth={1.75} aria-hidden="true"/> Toutes les catégories <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true"/></button>
            <div className="mb-nav-drop"><CategoryMenu categories={categories} title="Toutes les catégories"/></div>
          </div>
          {categories.map((item) => <Link key={item.slug} className="mb-nav-link" href={`/${item.slug}`}>{item.name}</Link>)}
          <span className="mb-nav-spacer"/>
          <Link className="mb-nav-link mb-nav-link--promo" href="/promotions">Promotions</Link>
          <Link className="mb-nav-link" href="/favoris"><Heart size={16} strokeWidth={1.75} aria-hidden="true" style={{ marginRight: 6 }}/>Favoris</Link>
        </div>
      </nav>
    </header>
    <div className={`mb-drawer${open ? " is-open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="mb-drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="mb-drawer-head"><span>Catégories</span><button type="button" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X size={22} strokeWidth={1.75}/></button></div>
        <ul>
          {categories.map((item) => <li key={item.slug}>
            {item.children.length ? <details><summary>{item.name}</summary>
              <Link href={`/${item.slug}`} onClick={() => setOpen(false)}>Tout dans {item.name}</Link>
              {item.children.map((child) => <Link key={child.slug} href={`/${child.slug}`} onClick={() => setOpen(false)}>{child.name}</Link>)}
            </details> : <Link href={`/${item.slug}`} onClick={() => setOpen(false)}>{item.name}</Link>}
          </li>)}
          <li><Link href="/promotions" onClick={() => setOpen(false)}>Promotions</Link></li>
          <li><Link href="/suivi-commande" onClick={() => setOpen(false)}>Suivi de commande</Link></li>
          <li><Link href="/favoris" onClick={() => setOpen(false)}>Favoris</Link></li>
          <li><Link href="/contact" onClick={() => setOpen(false)}>Contact</Link></li>
        </ul>
      </div>
    </div>
  </>;
}
