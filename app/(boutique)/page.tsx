import type { Metadata } from "next";
import { ShieldCheck, Smartphone, Truck } from "lucide-react";
import { CategoryMenu } from "@/components/shop/category-menu";
import { HeroCarousel } from "@/components/shop/hero-carousel";
import { ProductSection } from "@/components/shop/product-section";
import { BANNERS } from "@/lib/shop/banners";
import { REASSURANCE, SHOP } from "@/lib/shop/config";
import { getCategoryTree, listProducts } from "@/lib/shop/queries";

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "MyBigMarket : lits à Abidjan et en Côte d'Ivoire" },
  description: "Lits 1 place, 2 places, 2,5 places et 3 places, lits enfants, superposés, pliables, en bois ou en métal, à Abidjan et partout en Côte d'Ivoire. Prix en FCFA, paiement par mobile money.",
  alternates: { canonical: "/" },
};

const ICONS = [Smartphone, Truck, ShieldCheck];

export default async function HomePage() {
  const [tree, bestRaw, fresh, pool] = await Promise.all([
    getCategoryTree(),
    listProducts({ flag: "best", limit: 10 }),
    listProducts({ sort: "nouveautes", limit: 10 }),
    listProducts({ limit: 30 }),
  ]);
  // Chaque rangée montre au moins 10 produits quand le catalogue le permet : on complète avec le reste du catalogue.
  const best = { ...bestRaw, items: [...bestRaw.items, ...pool.items.filter((item) => !bestRaw.items.some((own) => own.id === item.id))].slice(0, 10) };
  const menu = tree.map((category) => ({ name: category.name, slug: category.slug, children: category.children.map((child) => ({ name: child.name, slug: child.slug })) }));
  const organization = { "@context": "https://schema.org", "@type": "Store", name: SHOP.name, url: SHOP.baseUrl, telephone: `+${SHOP.whatsappNumber}`, email: SHOP.email, address: { "@type": "PostalAddress", addressLocality: "Abidjan", addressCountry: "CI" }, areaServed: "CI", currenciesAccepted: "XOF", paymentAccepted: "Mobile money (Orange Money, MTN MoMo, Moov Money, Wave)" };
  return <div className="mb-wrap mb-page" id="contenu" role="main">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}/>
    <h1 className="mb-sr">MyBigMarket, boutique en ligne à Abidjan</h1>
    <div className="mb-home-top" style={{ alignItems: "stretch" }}>
      <CategoryMenu categories={menu}/>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <HeroCarousel banners={BANNERS}/>
        <div className="mb-reassurance" style={{ margin: 0 }}>
          {REASSURANCE.map((item, index) => { const Icon = ICONS[index]; return <div key={item.title}><Icon size={22} strokeWidth={1.75} aria-hidden="true"/><div><b>{item.title}</b><span>{item.text}</span></div></div>; })}
        </div>
      </div>
    </div>

    <ProductSection title="Meilleures ventes" href="/produits?tri=pertinence" products={best.items}/>
    <ProductSection title="Nouveautés" href="/produits?tri=nouveautes" products={fresh.items}/>
    {best.total + fresh.total === 0 && <p className="mb-empty">Le catalogue est en cours de mise à jour. Écrivez-nous sur WhatsApp pour connaître les produits disponibles.</p>}
  </div>;
}
