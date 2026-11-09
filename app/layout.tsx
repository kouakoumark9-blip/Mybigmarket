import type { Metadata } from "next";
import { SHOP } from "@/lib/shop/config";
import "./globals.css";
import "./storefront-polish.css";
import "./mb.css";

export const metadata: Metadata = {
  metadataBase: new URL(SHOP.baseUrl),
  title: { default: "MyBigMarket : climatiseurs, informatique, électroménager à Abidjan", template: "%s | MyBigMarket" },
  description: "Boutique en ligne à Abidjan : climatiseurs, groupes électrogènes, informatique, électroménager et téléviseurs. Livraison partout en Côte d'Ivoire, paiement à la livraison.",
  openGraph: { type: "website", locale: "fr_CI", siteName: "MyBigMarket", title: "MyBigMarket : boutique en ligne à Abidjan", description: "Climatiseurs, groupes électrogènes, informatique et électroménager. Livraison partout en Côte d'Ivoire, paiement à la livraison." },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr-CI"><body>{children}</body></html>;
}
