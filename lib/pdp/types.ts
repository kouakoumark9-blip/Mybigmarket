/**
 * Modèle de données de la fiche produit (PDP).
 * Tous les composants de components/product-detail lisent uniquement cet objet :
 * aucune donnée n'est écrite en dur dans l'interface.
 */

export type Currency = "XOF";

export type ProductImage = { src: string; alt: string };

export type ColorVariant = {
  id: string;
  label: string;
  /** Vignette affichée dans la grille et image principale affichée au clic. */
  image: string;
  /** Prix propre à la variante (facultatif). */
  priceXof?: number;
};

export type DesignOption = { id: string; label: string };

export type LabeledValue = { label: string; value: string };

/** Puce « En un coup d'œil » : début en gras + suite. */
export type Highlight = { lead: string; text: string };

export type SupplierType = "Fabricant" | "Négociant" | "Grossiste";

export type Supplier = {
  name: string;
  /** Initiales ou image du logo. */
  logo?: string;
  initials: string;
  country: string;
  countryCode: string;
  yearsActive: number;
  type: SupplierType;
  onlineRevenue: string;
  responseTime: string;
  /** Pourcentage d'expédition dans les délais (0-100). */
  onTimeShipping: number;
  rating: number;
  ratingCount: number;
  verified: boolean;
  profileHref?: string;
};

export type FaqItem = { question: string; answer: string };

/** Carte produit des carrousels. */
export type ProductCardData = {
  id: string;
  slug?: string;
  title: string;
  image: string;
  priceMin: number;
  priceMax?: number;
  minOrderQty: number;
  /** Pastilles de couleur (3 affichées) et nombre total de coloris. */
  swatches?: string[];
  colorCount?: number;
  /** Prix barré et remise en %. */
  compareAtPrice?: number;
  discountPercent?: number;
};

export type Review = {
  id: string;
  author: string;
  country?: string;
  rating: number;
  date: string;
  text: string;
  photos?: ProductImage[];
  verified?: boolean;
};

export type ReviewSummary = {
  average: number;
  count: number;
  /** Nombre d'avis par note, index 0 = 5 étoiles … index 4 = 1 étoile. Absent si inconnu. */
  distribution?: [number, number, number, number, number];
  items: Review[];
};

export type ProductDescription = {
  paragraphs: string[];
  images: ProductImage[];
};

export type ShippingInfo = {
  /** Sous-texte tant qu'aucune option n'est choisie. */
  placeholder: string;
  carriers: Array<{ id: string; label: string; delay: string; feeXof?: number }>;
};

/** Tranche de prix par quantité (maxQuantity null : « et plus »). */
export type QuantityPrice = { minQuantity: number; maxQuantity: number | null; unitPriceXof: number };

export type Product = {
  id: string;
  slug: string;
  title: string;
  breadcrumb: Array<{ label: string; href: string }>;
  category: { label: string; slug: string };
  images: ProductImage[];
  videoUrl?: string;
  /** Étiquette de texte en haut à gauche de l'image principale. */
  imageLabel?: string;
  rating: number;
  reviewsCount: number;
  soldCount: number;
  rankLabel?: string;
  priceMin: number;
  priceMax: number;
  currency: Currency;
  minOrderQty: number;
  unit: string;
  lowestPriceBadge?: string;
  availability: "InStock" | "PreOrder" | "OutOfStock";
  colorVariants: ColorVariant[];
  designOptions: DesignOption[];
  designLabel?: string;
  keySpecs: LabeledValue[];
  highlights: Highlight[];
  attributes: LabeledValue[];
  supplier: Supplier;
  shipping: ShippingInfo;
  faq: FaqItem[];
  reviews: ReviewSummary;
  description: ProductDescription;
  related: ProductCardData[];
  boughtTogether: ProductCardData[];
  supplierProducts: ProductCardData[];
  /** Texte SEO (meta description). */
  metaDescription: string;
  /** Prix dégressifs réellement appliqués au panier ; absent s'il n'y a qu'un prix. */
  quantityPrices?: QuantityPrice[];
};
