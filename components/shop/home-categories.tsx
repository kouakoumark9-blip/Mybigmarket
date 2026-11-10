import Link from "next/link";
import { groupChildren } from "@/lib/shop/category-groups";

type Cat = { name: string; slug: string; children: Array<{ name: string; slug: string }> };

/** Catégories affichées sous la bannière de la page d'accueil. */
export function HomeCategories({ categories }: { categories: Cat[] }) {
  if (!categories.length) return null;
  return <section className="mb-homecats" aria-label="Catégories de la boutique">
    {categories.map((root) => <div key={root.slug} className="mb-homecats-root">
      <div className="mb-homecats-head">
        <h2><Link href={`/${root.slug}`}>{root.name}</Link></h2>
        <Link href={`/${root.slug}`} className="mb-homecats-all">Voir tous les {root.name.toLowerCase()} →</Link>
      </div>
      <div className="mb-homecats-grid">
        {groupChildren(root.slug, root.children).map((group, index) => <div key={group.title ?? `g${index}`} className="mb-homecats-col">
          {group.title && <h3>{group.title}</h3>}
          <ul>{group.items.map((item) => <li key={item.slug}><Link href={`/${item.slug}`}>{item.name}</Link></li>)}</ul>
        </div>)}
      </div>
    </div>)}
  </section>;
}
