import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CartProvider } from "@/components/cart-provider";
import { CountryPreferencesProvider } from "@/components/country-preferences";
import { LocaleCurrencyLabel } from "@/components/locale-currency-label";
import { ProductCompareProvider } from "@/components/product-compare";
import { FavoritesProvider } from "@/components/favorites-provider";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeScript } from "@/components/theme-script";
import { destinationByCode } from "@/lib/west-africa";
import "./globals.css";

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
  return <html lang={destination.locale} dir={destination.language === "ar" ? "rtl" : "ltr"} suppressHydrationWarning><head><ThemeScript/></head><body><ThemeProvider><CountryPreferencesProvider initialCountryCode={destination.code}><FavoritesProvider><ProductCompareProvider><CartProvider><SiteHeader/>{children}<footer className="site-footer"><div className="shell footer-grid"><div><Link className="brand footer-brand" href="/"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>CHINE → AFRIQUE DE L’OUEST</small></span></Link></div><div><b>Découvrir</b><Link href="/produits">Catalogue</Link></div><div><b>Aide & confiance</b><Link href="/conditions">Conditions de vente</Link><Link href="/confidentialite">Confidentialité</Link></div><div className="footer-contact"><b>Besoin d’aide ?</b><span>Assistance client</span><span>Afrique de l’Ouest</span></div></div><div className="shell footer-bottom"><span>© 2026 mybigmarket · Prototype de démonstration</span><LocaleCurrencyLabel/></div></footer></CartProvider></ProductCompareProvider></FavoritesProvider></CountryPreferencesProvider></ThemeProvider></body></html>;
}
