import type { Metadata } from "next";
import Link from "next/link";
import { CartProvider } from "@/components/cart-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.example"),
  title: { default: "mybigmarket — Chine → Côte d’Ivoire", template: "%s | mybigmarket" },
  description: "Découvrez une marketplace de précommande entre étudiants en Chine et acheteurs en Côte d’Ivoire. Vendeurs vérifiés, prix en FCFA et suivi de commande.",
  openGraph: { title: "mybigmarket — Chine → Côte d’Ivoire", description: "Des trouvailles de Chine, suivies jusqu’à Abidjan.", locale: "fr_CI", type: "website" },
  icons: { icon: [], shortcut: [], apple: [] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr-CI"><body><CartProvider><SiteHeader/>{children}<footer className="site-footer"><div className="shell footer-grid"><div><Link className="brand footer-brand" href="/"><span className="brand-mark">M</span><span>mybigmarket<small>CHINE → ABIDJAN</small></span></Link><p>La plateforme ivoirienne de précommandes groupées et d’achats de gros entre la Chine et Abidjan.</p></div><div><b>Découvrir</b><Link href="/produits">Catalogue</Link><Link href="/#fonctionnement">Comment ça marche</Link><Link href="/vendeur">Devenir vendeur</Link></div><div><b>Aide & confiance</b><Link href="/compte/commandes">Suivre une commande</Link><Link href="/conditions">Conditions de vente</Link><Link href="/confidentialite">Confidentialité</Link></div><div className="footer-contact"><b>Besoin d’aide ?</b><span>Assistance en français</span><span>Abidjan, Côte d’Ivoire</span></div></div><div className="shell footer-bottom"><span>© 2026 mybigmarket · Prototype de démonstration</span><span>Devise : FCFA (XOF)</span></div></footer></CartProvider></body></html>;
}
