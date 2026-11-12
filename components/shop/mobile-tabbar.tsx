"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BedDouble, Home, LayoutGrid, Layers, ShoppingCart, Tag, X, type LucideIcon } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { groupChildren } from "@/lib/shop/category-groups";

type Item = { name: string; slug: string; image: string | null };
type Category = Item & { children: Item[] };

const ICONS: Record<string, LucideIcon> = { lits: BedDouble, matelas: Layers };

/** Pastille ronde : photo du premier produit de la catégorie, ou un pictogramme si elle n'a pas encore de photo. */
function Round({ item, size = 64 }: { item: Item; size?: number }) {
  const Icon = ICONS[item.slug.split("/")[0]] ?? Tag;
  return <span className="mb-round" style={{ width: size, height: size }}>
    {item.image ? <Image src={item.image} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }}/> : <Icon size={Math.round(size * 0.4)} strokeWidth={1.5} aria-hidden="true"/>}
  </span>;
}

/**
 * Barre du bas sur téléphone : Accueil, Catégories (pastilles rondes avec photo) et Panier.
 * Visible seulement sur petit écran.
 */
export function MobileTabBar({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const { count } = useCart();
  // La feuille est liée à la page où elle a été ouverte : en changeant de page, elle se referme d'elle-même.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (value: boolean | ((current: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(open) : value;
    setOpenPath(next ? pathname : null);
  };
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenPath(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onHome = pathname === "/";
  const onCart = pathname === "/panier";
  return <>
    <nav className="mobile-tabbar" aria-label="Navigation principale">
      <Link href="/" className={onHome ? "is-active" : ""} aria-current={onHome ? "page" : undefined}><Home size={22} strokeWidth={1.75} aria-hidden="true"/><span>Accueil</span></Link>
      <button type="button" className={open ? "is-active" : ""} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mb-cat-sheet"><LayoutGrid size={22} strokeWidth={1.75} aria-hidden="true"/><span>Catégories</span></button>
      <Link href="/panier" className={onCart ? "is-active" : ""} aria-current={onCart ? "page" : undefined} aria-label={`Panier, ${count} article${count > 1 ? "s" : ""}`}>
        <span className="mb-tab-cart"><ShoppingCart size={22} strokeWidth={1.75} aria-hidden="true"/>{count > 0 && <b aria-hidden="true">{count}</b>}</span><span>Panier</span>
      </Link>
    </nav>
    <div className={`mb-catsheet${open ? " is-open" : ""}`} id="mb-cat-sheet" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="mb-catsheet-panel" role="dialog" aria-modal="true" aria-label="Catégories">
        <div className="mb-catsheet-head"><h2>Catégories</h2><button type="button" onClick={() => setOpen(false)} aria-label="Fermer"><X size={22} strokeWidth={1.75}/></button></div>
        {/* Le contenu n'existe dans la page que lorsque la feuille est ouverte : rien de caché, rien de lu à tort (lecteurs d'écran, tests). */}
        {open && <div className="mb-catsheet-body">
          {categories.map((root) => <section key={root.slug} aria-label={root.name}>
            <h3>{root.name}</h3>
            <ul className="mb-roundgrid"><li><Link href={`/${root.slug}`}><Round item={root}/><span>Tous les {root.name.toLowerCase()}</span></Link></li></ul>
            {/* Seules les catégories qui ont déjà un produit avec photo sont proposées : pas de page vide au bout du clic. */}
            {groupChildren(root.slug, root.children.filter((child) => child.image)).map((group, index) => <div key={group.title ?? index} className="mb-catsheet-group">
              {group.title && <h4>{group.title}</h4>}
              <ul className="mb-roundgrid">{group.items.map((child) => <li key={child.slug}><Link href={`/${child.slug}`} aria-current={pathname === `/${child.slug}` ? "page" : undefined}><Round item={child}/><span>{child.name}</span></Link></li>)}</ul>
            </div>)}
          </section>)}
        </div>}
      </div>
    </div>
  </>;
}
