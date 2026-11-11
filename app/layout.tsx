import type { Metadata } from "next";
import { SHOP } from "@/lib/shop/config";
import "./globals.css";
import "./storefront-polish.css";
import "./mb.css";

export const metadata: Metadata = {
  metadataBase: new URL(SHOP.baseUrl),
  title: { default: "MyBigMarket : lits à Abidjan et en Côte d'Ivoire", template: "%s | MyBigMarket" },
  description: "MyBigMarket, fournisseur officiel de la marque CIL en Côte d'Ivoire : lits, matelas, oreillers et canapés à Abidjan. Livraison partout en Côte d'Ivoire, paiement par mobile money.",
  openGraph: { type: "website", locale: "fr_CI", siteName: "MyBigMarket", title: "MyBigMarket : boutique en ligne à Abidjan", description: "Lits de toutes tailles, lits enfants, superposés, en bois ou en métal. Livraison partout en Côte d'Ivoire, paiement par mobile money." },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr-CI">
    <body>{children}</body>
  </html>;
}
