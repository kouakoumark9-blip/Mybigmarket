import Link from "next/link";
import { FlagCI } from "./flag-ci";

type Cat = { name: string; slug: string };

/** Catégories principales, affichées au-dessus de la bannière de la page d'accueil. */
export function HomeCategories({ categories }: { categories: Cat[] }) {
  if (!categories.length) return null;
  return <nav className="mb-homecats" aria-label="Catégories de la boutique">
    {categories.map((root) => <Link key={root.slug} href={`/${root.slug}`}>{root.name}</Link>)}
    <span className="mb-homecats-flag"><FlagCI/> <b>Côte d&apos;Ivoire</b></span>
  </nav>;
}
