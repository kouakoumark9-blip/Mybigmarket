import { CartProvider } from "@/components/cart-provider";
import { CountryPreferencesProvider } from "@/components/country-preferences";
import { FavoritesProvider } from "@/components/favorites-provider";
import { ProductCompareProvider } from "@/components/product-compare";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { getCategoryTree } from "@/lib/shop/queries";

/** Les pages se rafraîchissent toutes les minutes ; l'administration les rafraîchit aussitôt après une modification. */
export const revalidate = 60;

export default async function BoutiqueLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tree = await getCategoryTree();
  const menu = tree.map((category) => ({ name: category.name, slug: category.slug, children: category.children.map((child) => ({ name: child.name, slug: child.slug })) }));
  // La fiche produit lit la devise et la langue dans ce fournisseur : la boutique ne sert que la Côte d'Ivoire, en français.
  return <CountryPreferencesProvider initialCountryCode="CI">
    <FavoritesProvider><ProductCompareProvider><CartProvider>
      <SiteHeader categories={menu}/>
      {children}
      <SiteFooter/>
    </CartProvider></ProductCompareProvider></FavoritesProvider>
  </CountryPreferencesProvider>;
}
