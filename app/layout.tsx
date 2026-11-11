import type { Metadata } from "next";
import { SHOP } from "@/lib/shop/config";
import "./globals.css";
import "./storefront-polish.css";
import "./mb.css";

export const metadata: Metadata = {
  metadataBase: new URL(SHOP.baseUrl),
  title: { default: "MyBigMarket : lits à Abidjan et en Côte d'Ivoire", template: "%s | MyBigMarket" },
  description: "Boutique en ligne à Abidjan : lits de toutes tailles, lits enfants, superposés, pliables, en bois ou en métal. Livraison partout en Côte d'Ivoire, paiement par mobile money.",
  openGraph: { type: "website", locale: "fr_CI", siteName: "MyBigMarket", images: [{ url: "/og-mybigmarket.jpg", width: 1200, height: 630, alt: "MyBigMarket : lits et matelas à Abidjan" }], title: "MyBigMarket : boutique en ligne à Abidjan", description: "Lits de toutes tailles, lits enfants, superposés, en bois ou en métal. Livraison partout en Côte d'Ivoire, paiement par mobile money." },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  // Autorise Google à afficher de grandes images et de longs extraits dans ses résultats.
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  // Codes de vérification Search Console / Bing Webmaster : à renseigner dans les variables GOOGLE_SITE_VERIFICATION et BING_SITE_VERIFICATION.
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr-CI">
    <body>{children}</body>
  </html>;
}
