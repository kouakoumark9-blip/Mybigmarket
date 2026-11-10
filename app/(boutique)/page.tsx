import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Banknote, Headset, RotateCcw, Truck } from "lucide-react";
import { CategoryIcon } from "@/components/shop/category-icon";
import { CategoryMenu } from "@/components/shop/category-menu";
import { HeroCarousel } from "@/components/shop/hero-carousel";
import { ProductSection } from "@/components/shop/product-section";
import { BANNERS } from "@/lib/shop/banners";
import { REASSURANCE, SHOP } from "@/lib/shop/config";
import { getCategoryTree, listProducts } from "@/lib/shop/queries";

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "MyBigMarket : climatiseurs, informatique, électroménager à Abidjan" },
  description: "Climatiseurs, groupes électrogènes, informatique, électroménager et téléviseurs à Abidjan et partout en Côte d'Ivoire. Prix en FCFA, paiement à la livraison.",
  alternates: { canonical: "/" },
};

const ICONS = [Truck, Banknote, RotateCcw, Headset];

export default async function HomePage() {
  const [tree, best, fresh, promo] = await Promise.all([
    getCategoryTree(),
    listProducts({ flag: "best", limit: 10 }),
    listProducts({ sort: "nouveautes", limit: 10 }),
    listProducts({ flag: "promo", limit: 10, sort: "prix-croissant" }),
  ]);
  const menu = tree.map((category) => ({ name: category.name, slug: category.slug, children: category.children.map((child) => ({ name: child.name, slug: child.slug })) }));
  const organization = { "@context": "https://schema.org", "@type": "Store", name: SHOP.name, url: SHOP.baseUrl, telephone: `+${SHOP.whatsappNumber}`, email: SHOP.email, address: { "@type": "PostalAddress", addressLocality: "Abidjan", addressCountry: "CI" }, areaServed: "CI", currenciesAccepted: "XOF", paymentAccepted: "Paiement à la livraison" };
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}/>
    <h1 className="mb-sr">MyBigMarket, boutique en ligne à Abidjan</h1>
    <div className="mb-home-top" style={{ alignItems: "stretch" }}>
      <CategoryMenu categories={menu}/>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <HeroCarousel banners={BANNERS}/>
        <div className="mb-reassurance" style={{ margin: 0, flex: 1 }}>
          {REASSURANCE.map((item, index) => { const Icon = ICONS[index]; return <div key={item.title}><Icon size={22} strokeWidth={1.75} aria-hidden="true"/><div><b>{item.title}</b><span>{item.text}</span></div></div>; })}
        </div>
      </div>
    </div>

    {tree.length > 0 && <section className="mb-section" aria-label="Catégories">
      <div className="mb-section-head"><div><span className="mb-eyebrow">Catalogue</span><h2>Acheter par catégorie</h2></div></div>
      <div className="mb-section-body"><div className="mb-cat-grid">
        {tree.map((category) => <Link key={category.slug} className="mb-cat-tile" href={`/${category.slug}`}>
          <span className="mb-cat-tile-img">{category.imageUrl ? <Image src={category.imageUrl} alt="" width={200} height={200}/> : <CategoryIcon slug={category.slug}/>}</span>
          {category.name}
        </Link>)}
      </div></div>
    </section>}

    <ProductSection title="Meilleures ventes" href="/produits?tri=pertinence" products={best.items}/>
    <ProductSection title="Nouveautés" href="/produits?tri=nouveautes" products={fresh.items}/>
    <ProductSection title="Promotions" href="/promotions" products={promo.items} promo/>
    {best.total + fresh.total + promo.total === 0 && <p className="mb-empty">Le catalogue est en cours de mise à jour. Écrivez-nous sur WhatsApp pour connaître les produits disponibles.</p>}
  </div>;
}
