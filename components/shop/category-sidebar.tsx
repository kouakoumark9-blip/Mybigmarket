import Link from "next/link";
import { groupChildren } from "@/lib/shop/category-groups";
import type { ShopCategory } from "@/lib/shop/types";

/** Colonne « Catégorie » de la page de liste : intertitres en gras, liens en dessous, catégorie courante repérée. */
export function CategorySidebar({ root, currentSlug }: { root: ShopCategory; currentSlug: string }) {
  return <nav className="mb-catside" aria-label={`Catégories ${root.name}`}>
    <h2>Catégorie</h2>
    <Link className="mb-catside-all" href={`/${root.slug}`} aria-current={currentSlug === root.slug ? "page" : undefined}>Tous les {root.name.toLowerCase()}</Link>
    {groupChildren(root.slug, root.children).map((group, index) => <div key={group.title ?? index} className="mb-catside-group">
      {group.title && <h3>{group.title}</h3>}
      <ul>{group.items.map((child) => <li key={child.slug}>
        <Link href={`/${child.slug}`} aria-current={currentSlug === child.slug ? "page" : undefined}>{child.name}</Link>
      </li>)}</ul>
    </div>)}
  </nav>;
}
