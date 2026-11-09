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
  { desktop: "/bannieres/slide-1-bureau.webp", mobile: "/bannieres/slide-1-bureau.webp", alt: "Une famille ivoirienne dans sa cuisine équipée : petit et gros électroménager", href: "/petit-electromenager",
    fallback: { title: "Petit et gros électroménager", text: "En stock à Abidjan, livraison 24 à 72 h" } },
  // Pour ajouter une 2e, 3e… bannière (3 à 5 conseillées) : déposez l'image dans public/bannieres/ puis copiez ce modèle.
  // { desktop: "/bannieres/slide-2-bureau.jpg", mobile: "/bannieres/slide-2-mobile.jpg", alt: "Groupes électrogènes et onduleurs", href: "/electrogene",
  //   fallback: { title: "Groupes électrogènes et onduleurs", text: "Gardez le courant à la maison et à la boutique" } },
];
