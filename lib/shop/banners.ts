/**
 * Bannières du carrousel d'accueil (3 à 5 diapositives).
 *
 * Pour installer vos images : déposez-les dans le dossier public/bannieres/ puis ajustez les noms ci-dessous.
 *   - ordinateur : 2000 × 667 px (format 3 : 1) ; un format plus large est coupé en haut et en bas
 *   - mobile     : 1080 × 540 px (le fichier ordinateur sert aussi sur mobile s'il n'y a pas de version mobile)
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
  { desktop: "/bannieres/accueil.webp", mobile: "/bannieres/accueil.webp", alt: "MyBigMarket : tout pour votre maison, livré partout en Côte d'Ivoire. Voir les offres", href: "/lits",
    fallback: { title: "Lits de toutes tailles", text: "En stock à Abidjan, livraison 24 à 72 h" } },
  // Pour ajouter d'autres bannières : déposez l'image dans public/bannieres/ puis copiez le modèle ci-dessus.
];
