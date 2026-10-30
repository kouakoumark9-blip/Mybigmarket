"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Search, ShoppingBag, UserRound, Menu, X, Store, MessageCircle, MapPin, UserRoundPlus, Home, Grid2X2, ClipboardList } from "lucide-react";
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
        <Link className="brand" href="/" aria-label="Mybigmarket, accueil"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>CHINE → ABIDJAN</small></span></Link>
        <form action="/produits" className="search-form"><Search size={18}/><input name="q" placeholder="Rechercher un produit, une catégorie..." aria-label="Rechercher un produit"/><button type="submit" aria-label="Lancer la recherche"><span>Rechercher</span><Search className="mobile-search-submit-icon" size={17}/></button></form>
        <div className="header-actions">
          <span className="header-locale"><MapPin size={15}/><span>CI · FCFA</span></span>
          <Link href="/panier" className="header-action cart-action" aria-label={`Panier${count ? `, ${count} article${count > 1 ? "s" : ""}` : ""}`}><span className="cart-icon"><ShoppingBag size={20}/>{count > 0 && <b>{count}</b>}</span><span>Panier<small>Mes achats</small></span></Link>
          <Link href="/connexion" className="header-action"><UserRound size={19}/><span>Se connecter<small>Mon compte</small></span></Link>
          <Link href="/inscription" className="header-signup"><UserRoundPlus size={15}/><span>Créer un compte</span></Link>
        </div>
      </div>
      <nav className={`main-nav ${mobileOpen ? "is-open" : ""}`} aria-label="Navigation principale">
        <div className="shell main-nav-inner"><Link className={`nav-categories ${pathname === "/produits" ? "active" : ""}`} href="/produits" onClick={() => setMobileOpen(false)}><Menu size={16}/> Tous les rayons</Link>
          {categories.map((category) => <Link key={category.slug} href={`/produits?categorie=${category.slug}`} onClick={() => setMobileOpen(false)}>{category.name}</Link>)}
          <Link href="/#fonctionnement" onClick={() => setMobileOpen(false)}>Comment ça marche ?</Link>
          <Link href="/vendeurs" onClick={() => setMobileOpen(false)}>Vendeurs</Link>
          <Link href="/demande-de-devis" onClick={() => setMobileOpen(false)}>Demander un devis</Link>
          <Link href="/messages" onClick={() => setMobileOpen(false)}><MessageCircle size={15}/> Messages</Link>
          <Link className="nav-seller-mobile" href="/inscription" onClick={() => setMobileOpen(false)}><UserRoundPlus size={15}/> Créer un compte</Link>
          <Link className="nav-seller-mobile" href="/compte/demandes" onClick={() => setMobileOpen(false)}>Mes demandes de devis</Link>
          <Link className="nav-seller-mobile" href="/vendeur" onClick={() => setMobileOpen(false)}><Store size={15}/> Espace vendeur</Link>
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
