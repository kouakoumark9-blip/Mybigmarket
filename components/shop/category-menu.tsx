import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { menuEntries } from "@/lib/shop/category-groups";
import type { MenuCategory } from "./menu-types";

/** Colonne des catégories : chaque entrée ouvre, au survol ou au clavier, la liste de ses sous-catégories. */
export function CategoryMenu({ categories, title = "Catégories" }: { categories: MenuCategory[]; title?: string }) {
  return <nav className="mb-catmenu" aria-label={title}>
    <h2 className="mb-catmenu-title">{title}</h2>
    <ul>
      {menuEntries(categories).map((entry) => <li key={entry.key}>
        <Link href={entry.href}>{entry.label}{entry.children.length > 0 && <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="mb-icon"/>}</Link>
        {entry.children.length > 0 && <div className="mb-sub">
          <span className="mb-sub-title">{entry.label}</span>
          {entry.children.map((child) => <Link key={child.slug} href={`/${child.slug}`}>{child.name}</Link>)}
        </div>}
      </li>)}
    </ul>
  </nav>;
}
