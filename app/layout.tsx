import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CartProvider } from "@/components/cart-provider";
import { CountryPreferencesProvider } from "@/components/country-preferences";
import { ProductCompareProvider } from "@/components/product-compare";
import { FavoritesProvider } from "@/components/favorites-provider";
import { SiteHeader } from "@/components/site-header";
import { destinationByCode, localeForCountry, resolveCountryLanguage } from "@/lib/west-africa";
import { LANGUAGE_COOKIE } from "@/lib/i18n";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";
import "./storefront-polish.css";
import { listOpenPaymentMethodCodes } from "@/lib/payments-open";
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
  const language = resolveCountryLanguage(destination, cookieStore.get(LANGUAGE_COOKIE)?.value);
  const [openMethods, whatsapp] = await Promise.all([listOpenPaymentMethodCodes(), getStoreWhatsapp()]);
  return <html lang={localeForCountry(destination, language)} dir={language === "ar" ? "rtl" : "ltr"}><body><CountryPreferencesProvider initialCountryCode={destination.code} initialLanguage={language}><FavoritesProvider><ProductCompareProvider><CartProvider><SiteHeader/>{children}<WhatsappButton number={whatsapp}/><SiteFooter openMethods={openMethods}/></CartProvider></ProductCompareProvider></FavoritesProvider></CountryPreferencesProvider></body></html>;
}
