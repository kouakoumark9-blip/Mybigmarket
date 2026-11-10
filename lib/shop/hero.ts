/**
 * Hero de la page d'accueil. Pour changer un texte ou l'image : modifiez-les ici.
 * Image : déposez un fichier net, format paysage (2000 × 1100 px conseillé), dans public/bannieres/ puis changez le nom ci-dessous.
 */
export const HERO = {
  title: "Tout pour la maison, livré chez vous",
  subtitle: "Climatisation, électroménager, informatique, énergie.",
  cta: { label: "Découvrir nos produits", href: "/produits" },
  image: {
    src: "/bannieres/hero-accueil.webp",
    alt: "Mixeur, bouilloire, grille-pain, friteuse à air et cafetière sur un plan de travail de cuisine",
  },
} as const;
