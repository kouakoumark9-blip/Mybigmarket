"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ChevronDown, Menu, Search, ShoppingCart, Truck, X } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { SHOP, TOP_STRIP, whatsappLink } from "@/lib/shop/config";
import { Logo } from "./logo";
import { CategoryMenu } from "./category-menu";
import { CategoryIcon } from "./category-icon";
import { groupChildren } from "@/lib/shop/category-groups";
import type { MenuCategory } from "./menu-types";

/** Bande du haut, en-tête (logo, recherche, compte, panier, WhatsApp), menu des catégories. */
export function SiteHeader({ categories }: { categories: MenuCategory[] }) {
  const router = useRouter();
  const { count } = useCart();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    const params = term ? `?q=${encodeURIComponent(term)}` : "";
    router.push(`/produits${params}`);
    setOpen(false);
  }

  return <>
    <a className="mb-skip" href="#contenu">Aller au contenu</a>
    <div className="mb-strip"><div className="mb-wrap">
      <span className="mb-strip-msg">{TOP_STRIP.split("•").map((part) => <span key={part}>{part.trim()}</span>)}</span>
      <a href={whatsappLink()} rel="noopener">{SHOP.phoneDisplay}</a>
    </div></div>
    <header className="mb-header">
      <div className="mb-wrap mb-header-main">
        <button type="button" className="mb-menu-toggle" onClick={() => setOpen(true)} aria-label="Ouvrir le menu des catégories"><Menu size={24} strokeWidth={1.75}/></button>
        <Logo/>
        <form className="mb-search" role="search" onSubmit={submit}>
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
        </div>
      </div>
      <nav className="mb-nav" aria-label="Catégories">
        <div className="mb-wrap">
          <div className="mb-nav-all">
            <button type="button"><Menu size={18} strokeWidth={1.75} aria-hidden="true"/> Toutes les catégories <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true"/></button>
            <div className="mb-nav-drop"><CategoryMenu categories={categories} title="Toutes les catégories"/></div>
          </div>
        </div>
      </nav>
    </header>
    <div className={`mb-drawer${open ? " is-open" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="mb-drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="mb-drawer-head"><span>Catégories</span><button type="button" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X size={22} strokeWidth={1.75}/></button></div>
        <ul>
          {categories.map((item) => <li key={item.slug}>
            {item.children.length ? <details><summary><CategoryIcon slug={item.slug}/>{item.name}</summary>
              <Link href={`/${item.slug}`} onClick={() => setOpen(false)}>Tout dans {item.name}</Link>
              {groupChildren(item.slug, item.children).map((group, index) => <div key={group.title ?? index} className="mb-drawer-group">
                {group.title && <span className="mb-drawer-group-title">{group.title}</span>}
                {group.items.map((child) => <Link key={child.slug} href={`/${child.slug}`} onClick={() => setOpen(false)}>{child.name}</Link>)}
              </div>)}
            </details> : <Link href={`/${item.slug}`} onClick={() => setOpen(false)}><CategoryIcon slug={item.slug}/>{item.name}</Link>}
          </li>)}
          <li><Link href="/suivi-commande" onClick={() => setOpen(false)}>Suivi de commande</Link></li>
          <li><Link href="/favoris" onClick={() => setOpen(false)}>Favoris</Link></li>
          <li><Link href="/contact" onClick={() => setOpen(false)}>Contact</Link></li>
        </ul>
      </div>
    </div>
  </>;
}
