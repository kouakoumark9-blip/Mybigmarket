/**
 * Bannières du carrousel d'accueil (3 à 5 diapositives).
 *
 * Pour installer vos images : déposez-les dans le dossier public/bannieres/ puis ajustez les noms ci-dessous.
 *   - ordinateur : 2172 × 274 px (format panoramique, texte centré, marges de 150 px de chaque côté)
 *   - mobile     : 1080 × 540 px
 * Tant qu'un fichier est absent, un bandeau de texte (champ « fallback ») s'affiche à la place.
 */
export type Banner = {
  desktop: string;
  mobile: string;
  alt: string;
  href: string;
  fallback: { title: string; text: string };
};

export const BANNERS: Banner[] = [
  { desktop: "/bannieres/slide-1-bureau.jpg", mobile: "/bannieres/slide-1-mobile.jpg", alt: "Climatiseurs à Abidjan : split et inverter", href: "/climatiseurs",
    fallback: { title: "Climatiseurs split et inverter", text: "En stock à Abidjan, livraison 24 à 72 h" } },
  { desktop: "/bannieres/slide-2-bureau.jpg", mobile: "/bannieres/slide-2-mobile.jpg", alt: "Groupes électrogènes et onduleurs", href: "/electrogene",
    fallback: { title: "Groupes électrogènes et onduleurs", text: "Gardez le courant à la maison et à la boutique" } },
  { desktop: "/bannieres/slide-3-bureau.jpg", mobile: "/bannieres/slide-3-mobile.jpg", alt: "Promotions de la semaine", href: "/promotions",
    fallback: { title: "Promotions de la semaine", text: "Prix barrés, paiement à la livraison" } },
];
