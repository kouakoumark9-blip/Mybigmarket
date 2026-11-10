/**
 * Bannières affichées en haut des pages de catégorie (format paysage 2000 × 667 px).
 * Clé = adresse de la catégorie. Pour en ajouter une : déposez l'image dans public/bannieres/categories/ et ajoutez une ligne.
 */
export type CategoryBanner = { src: string; alt: string };

export const CATEGORY_BANNERS: Record<string, CategoryBanner> = {
  "lits": { src: "/bannieres/categories/lits.webp", alt: "Le confort qui rassemble toute la famille : lits solides et élégants, livrés chez vous en Côte d'Ivoire" },
  "lits/lits-1-place": { src: "/bannieres/categories/lits-1-place.webp", alt: "Le lit 1 place qui illumine votre chambre : lits 1 place élégants et solides, livrés chez vous en Côte d'Ivoire" },
  "lits/lits-2-places": { src: "/bannieres/categories/lits-2-places.webp", alt: "Plus d'espace pour deux, plus de confort chaque nuit : offre spéciale sur les lits 2 places" },
};

export const categoryBanner = (slug: string): CategoryBanner | null => CATEGORY_BANNERS[slug] ?? null;
