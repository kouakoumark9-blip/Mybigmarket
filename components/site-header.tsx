"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ShoppingBag, UserRound, Menu, X, MessageCircle, MapPin, UserRoundPlus, Home, Grid2X2, ClipboardList, Heart, Globe } from "lucide-react";
import { useCart } from "@/components/cart-provider";
import { useFavorites } from "@/components/favorites-provider";

export function SiteHeader() {
  const { count } = useCart();
  const { count: favoritesCount } = useFavorites();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  return <>
    <div className="top-strip"><div className="shell top-strip-inner"><span>Précommandes de Chine · prix affichés en FCFA</span><div><Link href="/compte/commandes">Suivre ma commande</Link></div></div></div>
    <header className="site-header">
      <div className="shell header-main">
        <button className="mobile-menu-button" aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X/> : <Menu/>}</button>
        <Link className="brand" href="/" aria-label="Mybigmarket, accueil"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>CHINE → ABIDJAN</small></span></Link>
        <div className="header-actions">
          <span className="header-locale"><MapPin size={16}/><span><b>Adresse de livraison :</b><small>Abidjan, CI</small></span></span>
          <span className="header-currency"><Globe size={17}/><span>Français · XOF</span></span>
          <Link href="/panier" className="header-action cart-action" aria-label={`Panier${count ? `, ${count} article${count > 1 ? "s" : ""}` : ""}`}><span className="cart-icon"><ShoppingBag size={20}/>{count > 0 && <b>{count}</b>}</span><span>Panier<small>Mes achats</small></span></Link>
          <Link href="/connexion" className="header-action"><UserRound size={19}/><span>Se connecter<small>Mon compte</small></span></Link>
          <Link href="/inscription" className="header-signup"><UserRoundPlus size={15}/><span>Créer un compte</span></Link>
        </div>
      </div>
      <nav className={`main-nav ${mobileOpen ? "is-open" : ""}`} aria-label="Navigation principale">
        <div className="shell main-nav-inner">
          <div className="main-nav-primary">
            <Link className={`nav-categories ${pathname.startsWith("/produits") ? "active" : ""}`} href="/produits" onClick={() => setMobileOpen(false)}><Menu size={16}/> Toutes les catégories</Link>
          </div>
          <div className="main-nav-secondary">
            <Link href="/messages" onClick={() => setMobileOpen(false)}><MessageCircle size={15}/> Messages</Link>
            <Link href="/favoris" className={pathname.startsWith("/favoris") ? "active" : ""} onClick={() => setMobileOpen(false)}><Heart size={15}/> Favoris{favoritesCount > 0 && <span className="favorite-nav-count">{favoritesCount}</span>}</Link>
            <Link className="nav-seller-mobile" href="/inscription" onClick={() => setMobileOpen(false)}><UserRoundPlus size={15}/> Créer un compte</Link>
          </div>
        </div>
      </nav>
      <div className="mobile-contact"><MapPin size={14}/> Achats Chine → Abidjan <span>·</span> Prix en FCFA</div>
    </header>
    <nav className="mobile-tabbar" aria-label="Navigation mobile">
      <Link href="/" className={pathname === "/" ? "active" : ""} aria-current={pathname === "/" ? "page" : undefined}><Home size={20}/><span>Accueil</span></Link>
      <Link href="/produits" className={pathname.startsWith("/produits") ? "active" : ""} aria-current={pathname.startsWith("/produits") ? "page" : undefined}><Grid2X2 size={20}/><span>Catégories</span></Link>
      <Link href="/messages" className={pathname.startsWith("/messages") ? "active" : ""} aria-current={pathname.startsWith("/messages") ? "page" : undefined}><MessageCircle size={20}/><span>Messages</span></Link>
      <Link href="/panier" className={pathname === "/panier" || pathname === "/checkout" ? "active" : ""} aria-current={pathname === "/panier" ? "page" : undefined}><span className="mobile-tabbar-icon"><ShoppingBag size={20}/>{count > 0 && <b>{count}</b>}</span><span>Panier</span></Link>
      <Link href="/compte/commandes" className={pathname.startsWith("/compte/commandes") ? "active" : ""} aria-current={pathname.startsWith("/compte/commandes") ? "page" : undefined}><ClipboardList size={20}/><span>Commandes</span></Link>
    </nav>
  </>;
}
