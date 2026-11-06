import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CartProvider } from "@/components/cart-provider";
import { CountryPreferencesProvider } from "@/components/country-preferences";
import { LocaleCurrencyLabel } from "@/components/locale-currency-label";
import { ProductCompareProvider } from "@/components/product-compare";
import { FavoritesProvider } from "@/components/favorites-provider";
import { SiteHeader } from "@/components/site-header";
import { destinationByCode } from "@/lib/west-africa";
import "./globals.css";
import "./storefront-polish.css";
import { hasOpenPaymentMethod } from "@/lib/payments-open";
import { getStoreWhatsapp } from "@/lib/store-contact";
import { WhatsappButton } from "@/components/whatsapp-button";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example"),
  title: { default: "mybigmarket — Chine → Afrique de l’Ouest", template: "%s | mybigmarket" },
  description: "Précommandes et achats entre la Chine et l’Afrique de l’Ouest. Consultez des prix indicatifs convertis selon la destination; livraison et frais à confirmer.",
  openGraph: { title: "mybigmarket — Chine → Afrique de l’Ouest", description: "Catalogue mybigmarket, prix indicatifs selon le pays choisi et livraison à confirmer.", locale: "fr_CI", type: "website" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const destination = destinationByCode(cookieStore.get("mybigmarket-country")?.value);
  const [paymentsOpen, whatsapp] = await Promise.all([hasOpenPaymentMethod(), getStoreWhatsapp()]);
  return <html lang={destination.locale} dir={destination.language === "ar" ? "rtl" : "ltr"}><body><CountryPreferencesProvider initialCountryCode={destination.code}><FavoritesProvider><ProductCompareProvider><CartProvider><SiteHeader/>{children}<WhatsappButton number={whatsapp}/><footer className="site-footer">  <div className="shell footer-grid">    <div className="footer-about">      <Link className="brand footer-brand" href="/"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>CHINE → AFRIQUE DE L’OUEST</small></span></Link>      <p>Vos achats en Chine, livrés en Afrique de l’Ouest : prix affichés dans votre devise, devis gratuit pour les grandes quantités et suivi de chaque commande.</p>      {paymentsOpen && <div className="footer-payments" aria-label="Moyens de paiement acceptés"><span>Mobile Money</span><span>Wave</span><span>Visa</span><span>Mastercard</span></div>}    </div>    <nav aria-label="Boutique"><b>Boutique</b><Link href="/produits">Tout le catalogue</Link><Link href="/produits?categorie=mode-accessoires">Mode & accessoires</Link><Link href="/produits?categorie=electronique">Téléphones & high-tech</Link><Link href="/produits?categorie=maison-cuisine">Maison & beauté</Link></nav>    <nav aria-label="Mon compte"><b>Mon compte</b><Link href="/connexion">Se connecter</Link><Link href="/compte/commandes">Suivre mes commandes</Link><Link href="/favoris">Mes favoris</Link><Link href="/panier">Mon panier</Link></nav>    <nav aria-label="Aide"><b>Aide & informations</b><Link href="/comment-ca-marche">Comment ça marche</Link><Link href="/demande-de-devis">Demande de devis</Link><Link href="/conditions">Conditions de vente</Link><Link href="/confidentialite">Confidentialité</Link></nav>  </div>  <div className="shell footer-bottom"><span>© 2026 mybigmarket · Tous droits réservés</span><LocaleCurrencyLabel/></div></footer></CartProvider></ProductCompareProvider></FavoritesProvider></CountryPreferencesProvider></body></html>;
}
