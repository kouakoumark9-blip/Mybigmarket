import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { MenuCategory } from "./menu-types";

/** Colonne des catégories (page d'accueil) : les sous-catégories s'ouvrent au survol ou au clavier. */
export function CategoryMenu({ categories, title = "Catégories" }: { categories: MenuCategory[]; title?: string }) {
  return <nav className="mb-catmenu" aria-label={title}>
    <h2 className="mb-catmenu-title">{title}</h2>
    <ul>
      {categories.map((category) => <li key={category.slug}>
        <Link href={`/${category.slug}`}>{category.name}{category.children.length > 0 && <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="mb-icon"/>}</Link>
        {category.children.length > 0 && <div className="mb-sub">
          <Link href={`/${category.slug}`} className="mb-sub-all">Tout dans {category.name}</Link>
          {category.children.map((child) => <Link key={child.slug} href={`/${child.slug}`}>{child.name}</Link>)}
        </div>}
      </li>)}
    </ul>
  </nav>;
}
