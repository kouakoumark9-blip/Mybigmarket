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
  { desktop: "/bannieres/slide-1-bureau.webp", mobile: "/bannieres/slide-1-bureau.webp", alt: "Une famille ivoirienne dans sa cuisine équipée : ", href: "/lits",
    fallback: { title: "Lits de toutes tailles", text: "En stock à Abidjan, livraison 24 à 72 h" } },
  { desktop: "/bannieres/slide-2-bureau.webp", mobile: "/bannieres/slide-2-bureau.webp", alt: "Un père et son fils devant un lave-linge : machines à laver et gros électroménager", href: "/lits",
    fallback: { title: "Lits enfants, lits superposés", text: "Livraison à Abidjan et en Côte d'Ivoire, paiement par mobile money" } },
  { desktop: "/bannieres/slide-3-bureau.webp", mobile: "/bannieres/slide-3-bureau.webp", alt: "Mixeur, bouilloire, grille-pain, friteuse à air, cafetière et fer à repasser sur un plan de travail", href: "/lits",
    fallback: { title: "Packs lit + matelas", text: "Le lit et son matelas ensemble" } },
  // Pour ajouter une 4e ou 5e bannière : déposez l'image dans public/bannieres/ puis copiez un des modèles ci-dessus.
];
