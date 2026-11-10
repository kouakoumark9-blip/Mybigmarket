import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { SHOP, whatsappLink } from "@/lib/shop/config";

export function SiteFooter() {
  return <>
    <footer className="mb-footer">
      <div className="mb-wrap mb-footer-grid">
        <div>
          <h2>MyBigMarket</h2>
          <p>Boutique en ligne à Abidjan : informatique, électrogène, climatiseurs et électroménager, livrés partout en Côte d&apos;Ivoire. Paiement à la livraison.</p>
          <p><b>WhatsApp et appels :</b> <a href={whatsappLink()} rel="noopener">{SHOP.phoneDisplay}</a></p>
          <p><b>Horaires :</b> {SHOP.hours}</p>
          <p><b>E-mail :</b> <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a></p>
        </div>
        <nav aria-label="Informations">
          <h2>Informations</h2>
          <ul>
            <li><Link href="/a-propos">À propos</Link></li>
            <li><Link href="/comment-commander">Comment commander</Link></li>
            <li><Link href="/livraison">Livraison</Link></li>
            <li><Link href="/retours-et-remboursements">Retours et remboursements</Link></li>
            <li><Link href="/contact">Contact</Link></li>
            <li><Link href="/favoris">Mes favoris</Link></li>
          </ul>
        </nav>
        <nav aria-label="Légal">
          <h2>Légal</h2>
          <ul>
            <li><Link href="/conditions-de-vente">Conditions de vente</Link></li>
            <li><Link href="/confidentialite">Confidentialité</Link></li>
            <li><Link href="/mentions-legales">Mentions légales</Link></li>
            <li><Link href="/suivi-commande">Suivi de commande</Link></li>
          </ul>
        </nav>
        <div>
          <h2>Livraison</h2>
          <p>Livraison à Abidjan (Cocody, Marcory, Yopougon, Plateau, Abobo, Koumassi, Treichville, Port-Bouët, Adjamé, Bingerville, Anyama) et dans les autres villes.</p>
        </div>
      </div>
      <div className="mb-footer-bottom"><div className="mb-wrap" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
        <span>© {new Date().getFullYear()} MyBigMarket · {SHOP.city}</span>
        <span>Prix en francs CFA (FCFA), toutes taxes comprises</span>
      </div></div>
    </footer>
    <a className="mb-wa-float" href={whatsappLink()} rel="noopener" aria-label="Écrire sur WhatsApp"><MessageCircle size={22} strokeWidth={1.75} aria-hidden="true"/><span>WhatsApp</span></a>
  </>;
}
