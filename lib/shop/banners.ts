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
  { desktop: "/bannieres/slide-2-bureau.webp", mobile: "/bannieres/slide-2-bureau.webp", alt: "Un père et son fils devant un lave-linge : machines à laver et gros électroménager", href: "/gros-electromenager/machines-a-laver",
    fallback: { title: "Machines à laver", text: "Livraison à Abidjan et en Côte d'Ivoire, paiement à la livraison" } },
  { desktop: "/bannieres/slide-3-bureau.webp", mobile: "/bannieres/slide-3-bureau.webp", alt: "Mixeur, bouilloire, grille-pain, friteuse à air, cafetière et fer à repasser sur un plan de travail", href: "/petit-electromenager",
    fallback: { title: "Petit électroménager", text: "Mixeurs, bouilloires, friteuses à air et plus encore" } },
  // Pour ajouter une 4e ou 5e bannière : déposez l'image dans public/bannieres/ puis copiez un des modèles ci-dessus.
];
