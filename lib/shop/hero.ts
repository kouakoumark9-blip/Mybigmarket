/**
 * Hero de la page d'accueil. Pour changer un texte ou les images : modifiez-les ici.
 * Images : fichiers nets, format paysage (2000 × 667 px ou plus), dans public/bannieres/. Elles défilent toutes les 5 secondes.
 * « position » règle la partie de l'image qui reste visible dans le cadre (0 % = gauche, 100 % = droite).
 */
export const HERO = {
  title: "Tout pour la maison, livré chez vous",
  subtitle: "Climatisation, électroménager, informatique, énergie.",
  cta: { label: "Découvrir nos produits", href: "/produits" },
  images: [
    { src: "/bannieres/slide-1-bureau.webp", alt: "Une famille dans sa cuisine équipée : petit et gros électroménager", position: "62% 50%" },
    { src: "/bannieres/slide-2-bureau.webp", alt: "Un père et son fils devant un lave-linge", position: "55% 50%" },
    { src: "/bannieres/slide-3-bureau.webp", alt: "Mixeur, bouilloire, grille-pain, friteuse à air et cafetière sur un plan de travail de cuisine", position: "60% 50%" },
  ],
} as const;
