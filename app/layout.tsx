import type { Metadata } from "next";
import Link from "next/link";
import { CartProvider } from "@/components/cart-provider";
import { ProductCompareProvider } from "@/components/product-compare";
import { FavoritesProvider } from "@/components/favorites-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example"),
  title: { default: "mybigmarket — Chine → Côte d’Ivoire", template: "%s | mybigmarket" },
  description: "Achats en gros et précommandes de Chine vers Abidjan, Côte d’Ivoire. Comparez les prix indicatifs en FCFA, les minimums et délais à confirmer.",
  openGraph: { title: "mybigmarket — Achats de Chine vers Abidjan", description: "Précommandes et achats de gros Chine–Abidjan, avec repères indicatifs en FCFA.", locale: "fr_CI", type: "website" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr-CI"><body><FavoritesProvider><ProductCompareProvider><CartProvider><SiteHeader/>{children}<footer className="site-footer"><div className="shell footer-grid"><div><Link className="brand footer-brand" href="/"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>CHINE → ABIDJAN</small></span></Link></div><div><b>Découvrir</b><Link href="/produits">Catalogue</Link></div><div><b>Aide & confiance</b><Link href="/compte/commandes">Suivre une commande</Link><Link href="/conditions">Conditions de vente</Link><Link href="/confidentialite">Confidentialité</Link></div><div className="footer-contact"><b>Besoin d’aide ?</b><span>Assistance en français</span><span>Abidjan, Côte d’Ivoire</span></div></div><div className="shell footer-bottom"><span>© 2026 mybigmarket · Prototype de démonstration</span><span>Devise : FCFA (XOF)</span></div></footer></CartProvider></ProductCompareProvider></FavoritesProvider></body></html>;
}
