"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag, UserRound, Menu, X, Store, Headset, MessageCircle, MapPin, UserRoundPlus } from "lucide-react";
import { categories } from "@/lib/demo-data";
import { useCart } from "@/components/cart-provider";

export function SiteHeader() {
  const { count } = useCart();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  return <>
    <div className="top-strip"><div className="shell top-strip-inner"><span>Précommandes de Chine · prix affichés en FCFA</span><div><Link href="/compte/commandes">Suivre ma commande</Link><span className="top-divider"/> <Link href="/vendeur">Vendre sur mybigmarket</Link></div></div></div>
    <header className="site-header">
      <div className="shell header-main">
        <button className="mobile-menu-button" aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X/> : <Menu/>}</button>
        <Link className="brand" href="/" aria-label="mybigmarket, accueil"><span className="brand-mark">M</span><span>mybigmarket<small>CHINE → ABIDJAN</small></span></Link>
        <form action="/produits" className="search-form"><Search size={18}/><input name="q" placeholder="Rechercher un produit, une catégorie..." aria-label="Rechercher un produit"/><button type="submit">Rechercher</button></form>
        <div className="header-actions">
          <span className="header-locale"><MapPin size={15}/><span>CI · FCFA</span></span>
          <Link href="/panier" className="header-action cart-action" aria-label={`Panier${count ? `, ${count} article${count > 1 ? "s" : ""}` : ""}`}><span className="cart-icon"><ShoppingBag size={20}/>{count > 0 && <b>{count}</b>}</span><span>Panier<small>Mes achats</small></span></Link>
          <Link href="/connexion" className="header-action"><UserRound size={19}/><span>Se connecter<small>Mon compte</small></span></Link>
          <Link href="/inscription" className="header-signup"><UserRoundPlus size={15}/><span>Créer un compte</span></Link>
        </div>
      </div>
      <nav className={`main-nav ${mobileOpen ? "is-open" : ""}`} aria-label="Navigation principale">
        <div className="shell main-nav-inner"><Link className={`nav-categories ${pathname === "/produits" ? "active" : ""}`} href="/produits"><Menu size={16}/> Tous les rayons</Link>
          {categories.map((category) => <Link key={category.slug} href={`/produits?categorie=${category.slug}`}>{category.name}</Link>)}
          <Link href="/#fonctionnement">Comment ça marche ?</Link>
          <Link href="/vendeurs">Vendeurs</Link>
          <Link href="/demande-de-devis">Demander un devis</Link>
          <Link href="/messages"><MessageCircle size={15}/> Messages</Link>
          <Link className="nav-seller-mobile" href="/inscription"><UserRoundPlus size={15}/> Créer un compte</Link>
          <Link className="nav-seller-mobile" href="/compte/demandes">Mes demandes de devis</Link>
          <Link className="nav-seller-mobile" href="/vendeur"><Store size={15}/> Espace vendeur</Link>
        </div>
      </nav>
    </header>
    <div className="mobile-contact"><Headset size={14}/> Assistance acheteurs <span>·</span> Livraison suivie à Abidjan</div>
  </>;
}
