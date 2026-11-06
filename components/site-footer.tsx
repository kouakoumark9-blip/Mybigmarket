"use client";

import Link from "next/link";
import { CountryFlag } from "@/components/country-flag";
import { useCountryPreferences } from "@/components/country-preferences";
import { LocaleCurrencyLabel } from "@/components/locale-currency-label";
import { PaymentLogos } from "@/components/payment-logos";
import { countryName, destinationCountries, languageLabels } from "@/lib/west-africa";

/** Pied de page : suit la langue du pays choisi. */
export function SiteFooter({ openMethods }: { openMethods: readonly string[] }) {
  const { tr, language, country, setSiteLanguage } = useCountryPreferences();
  const languages = country.languageOptions ?? [];
  return <footer className="site-footer">
    <div className="shell footer-grid">
      <div className="footer-about">
        <Link className="brand footer-brand" href="/"><span className="brand-wordmark"><span className="brand-initial">M</span>ybigmarket<small>{tr("CHINE → AFRIQUE DE L’OUEST")}</small></span></Link>
        <p>{tr("Vos achats en Chine, livrés en Afrique de l’Ouest : prix affichés dans votre devise, devis gratuit pour les grandes quantités et suivi de chaque commande.")}</p>
        <PaymentLogos methods={openMethods} height={26} className="footer-payments" label={tr("Moyens de paiement acceptés")}/>
        <div className="footer-countries"><b>{tr("Livraison en Afrique de l’Ouest")}</b><ul aria-label={tr("Pays desservis")}>{destinationCountries.map((item) => <li key={item.code}><CountryFlag code={item.code} size={26}/><span className="sr-only">{countryName(item.code, language)}</span></li>)}</ul></div>
      </div>
      <nav aria-label={tr("Boutique")}><b>{tr("Boutique")}</b><Link href="/produits">{tr("Tout le catalogue")}</Link><Link href="/produits?categorie=mode-accessoires">{tr("Mode & accessoires")}</Link><Link href="/produits?categorie=electronique">{tr("Téléphones & high-tech")}</Link><Link href="/produits?categorie=maison-cuisine">{tr("Maison & beauté")}</Link></nav>
      <nav aria-label={tr("Mon compte")}><b>{tr("Mon compte")}</b><Link href="/connexion">{tr("Se connecter")}</Link><Link href="/compte/commandes">{tr("Suivre mes commandes")}</Link><Link href="/favoris">{tr("Mes favoris")}</Link><Link href="/panier">{tr("Mon panier")}</Link></nav>
      <nav aria-label={tr("Aide & informations")}><b>{tr("Aide & informations")}</b><Link href="/comment-ca-marche">{tr("Comment ça marche")}</Link><Link href="/demande-de-devis">{tr("Demande de devis")}</Link><Link href="/conditions">{tr("Conditions de vente")}</Link><Link href="/confidentialite">{tr("Confidentialité")}</Link></nav>
    </div>
    <div className="shell footer-bottom"><span>{tr("© 2026 mybigmarket · Tous droits réservés")}</span><LocaleCurrencyLabel/>{languages.length > 1 && <div className="footer-languages" role="group" aria-label={tr("Langue")}>{languages.map((option) => <button key={option} type="button" lang={option} aria-pressed={option === language} className={option === language ? "is-active" : ""} onClick={() => setSiteLanguage(option)}>{languageLabels[option]}</button>)}</div>}</div>
  </footer>;
}
