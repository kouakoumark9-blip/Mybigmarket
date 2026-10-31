import Link from "next/link";
import { ArrowRight, House, Shirt, Smartphone, type LucideIcon } from "lucide-react";
import { categories, type DemoProduct } from "@/lib/demo-data";
import { ProductVisual } from "@/components/product-card";

type Shortcut = { label: string; query: string; categorySlug: string; productSlug: string };

const categoryIcons: Record<string, LucideIcon> = { "mode-accessoires": Shirt, electronique: Smartphone, "maison-cuisine": House };

const shortcuts: Shortcut[] = [
  { label: "Sacs & maroquinerie", query: "sac", categorySlug: "mode-accessoires", productSlug: "sac-cabas-urbain" },
  { label: "Montres & bijoux", query: "montre", categorySlug: "mode-accessoires", productSlug: "montre-minimaliste" },
  { label: "Lunettes & accessoires", query: "lunettes", categorySlug: "mode-accessoires", productSlug: "lunettes-uv400" },
  { label: "Audio & écouteurs", query: "écouteurs", categorySlug: "electronique", productSlug: "ecouteurs-bluetooth" },
  { label: "Accessoires mobiles", query: "support", categorySlug: "electronique", productSlug: "support-telephone" },
  { label: "PC & accessoires", query: "ordinateur", categorySlug: "electronique", productSlug: "etui-ordinateur" },
  { label: "Maison & éclairage", query: "lampe", categorySlug: "maison-cuisine", productSlug: "lampe-led-bureau" },
  { label: "Beauté & soin", query: "maquillage", categorySlug: "maison-cuisine", productSlug: "coffret-pinceaux" },
  { label: "Rangement maison", query: "rangement", categorySlug: "maison-cuisine", productSlug: "rangement-cosmetiques" },
];

export function CategoryDiscovery({ products, activeCategorySlug = "" }: { products: DemoProduct[]; activeCategorySlug?: string }) {
  const visibleShortcuts = shortcuts.filter((shortcut) => {
    const belongsToCategory = !activeCategorySlug || shortcut.categorySlug === activeCategorySlug;
    const productExists = products.some((product) => product.slug === shortcut.productSlug);
    return belongsToCategory && productExists;
  });

  return <section className="category-discovery" aria-label="Explorer les catégories">
    <aside className="category-discovery-rail">
      <div className="category-discovery-rail-heading"><b>Toutes les catégories</b><Link href="/produits" aria-label="Voir tout le catalogue"><ArrowRight size={15}/></Link></div>
      <nav aria-label="Catégories du catalogue">
        {categories.map((category) => { const CategoryIcon = categoryIcons[category.slug] ?? House; return <Link key={category.slug} href={`/produits?categorie=${category.slug}`} className={activeCategorySlug === category.slug ? "is-active" : ""} aria-current={activeCategorySlug === category.slug ? "page" : undefined}><CategoryIcon size={17} aria-hidden="true"/><span>{category.name}</span></Link>; })}
      </nav>
      <Link className="category-discovery-all" href="/produits">Tous les produits <ArrowRight size={14}/></Link>
    </aside>
    <div className="category-discovery-main">
      <header className="category-discovery-heading"><div><span className="eyebrow">SÉLECTION DU CATALOGUE</span><h2>Catégories pour vous</h2><p>Accédez rapidement aux produits par thème.</p></div><Link href="/produits">Voir le catalogue <ArrowRight size={14}/></Link></header>
      <div className="category-discovery-grid">
        {visibleShortcuts.map((shortcut) => {
          const product = products.find((item) => item.slug === shortcut.productSlug);
          if (!product) return null;
          return <Link className="category-discovery-tile" key={shortcut.productSlug} href={`/produits?categorie=${shortcut.categorySlug}&q=${encodeURIComponent(shortcut.query)}`}>
            <span className="category-discovery-image"><ProductVisual product={product}/></span>
            <b>{shortcut.label}</b>
          </Link>;
        })}
      </div>
      {visibleShortcuts.length === 0 && <p className="category-discovery-empty">Aucune sélection dans ce rayon pour le moment.</p>}
    </div>
  </section>;
}
