"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { groupChildren } from "@/lib/shop/category-groups";
import type { ShopCategory } from "@/lib/shop/types";

/**
 * Mobile : sous-catégories sur une seule ligne défilante (« Par taille », « Par type »… séparent les groupes).
 * La catégorie courante est mise en évidence et ramenée au centre de l'écran.
 */
export function CategoryChips({ root, currentSlug }: { root: ShopCategory; currentSlug: string }) {
  const row = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const current = row.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && row.current) row.current.scrollTo({ left: current.offsetLeft - row.current.clientWidth / 2 + current.clientWidth / 2, behavior: "auto" });
  }, [currentSlug]);
  return <nav className="mb-catchips" aria-label={`Catégories ${root.name}`}>
    <ul ref={row}>
      <li><Link className="mb-catchip mb-catchip--all" href={`/${root.slug}`} aria-current={currentSlug === root.slug ? "page" : undefined}>Tous les {root.name.toLowerCase()}</Link></li>
      {groupChildren(root.slug, root.children).map((group, index) => <li key={group.title ?? index} className="mb-catchips-group" role="presentation">
        {group.title && <span className="mb-catchips-title">{group.title}</span>}
        <ul>{group.items.map((child) => <li key={child.slug}><Link className="mb-catchip" href={`/${child.slug}`} aria-current={currentSlug === child.slug ? "page" : undefined}>{child.name}</Link></li>)}</ul>
      </li>)}
    </ul>
  </nav>;
}
