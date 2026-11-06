import type { DemoProduct } from "@/lib/demo-data";
import type { DetailedProduct } from "@/lib/product";
import type { Product, ProductCardData, ReviewSummary } from "@/lib/pdp/types";

const DEFAULT_CARRIERS: Product["shipping"]["carriers"] = [
  { id: "air", label: "Fret aérien groupé", delay: "10 à 15 jours" },
  { id: "sea", label: "Fret maritime", delay: "35 à 50 jours" },
];

/** Note globale connue, répartition inconnue : on ne l'invente pas. */
function summary(rating: number, count: number): ReviewSummary {
  return { average: rating, count, items: [] };
}

export function demoToCard(product: DemoProduct): ProductCardData {
  const prices = product.tiers?.map((tier) => tier.unitPriceXof) ?? [];
  return {
    id: product.slug,
    slug: product.slug,
    title: product.title,
    image: product.imageUrl || "/product-home.jpg",
    priceMin: prices.length ? Math.min(...prices) : product.priceXof,
    priceMax: prices.length ? Math.max(...prices) : undefined,
    minOrderQty: product.minimumQuantity,
  };
}

/** Produit du catalogue (Neon ou démo) → objet Product de la fiche. */
export function catalogToProduct(product: DemoProduct, all: DemoProduct[], description: string): Product {
  const prices = product.tiers?.map((tier) => tier.unitPriceXof) ?? [];
  const sameCategory = all.filter((item) => item.categorySlug === product.categorySlug && item.slug !== product.slug);
  const sameSeller = all.filter((item) => item.sellerSlug === product.sellerSlug && item.slug !== product.slug);
  const others = all.filter((item) => item.categorySlug !== product.categorySlug);
  const image = product.imageUrl || "/product-home.jpg";
  return {
    id: product.slug,
    slug: product.slug,
    title: product.title,
    breadcrumb: [
      { label: "Accueil", href: "/" },
      { label: product.category, href: `/produits?categorie=${product.categorySlug}` },
    ],
    category: { label: product.category, slug: product.categorySlug },
    images: [{ src: image, alt: product.title }],
    // Un produit d'exemple n'a ni note ni avis réels : on n'en affiche pas.
    rating: product.isDemo ? 0 : product.rating,
    reviewsCount: product.isDemo ? 0 : product.reviewCount,
    soldCount: 0,
    priceMin: prices.length ? Math.min(...prices) : product.priceXof,
    priceMax: prices.length ? Math.max(...prices) : product.priceXof,
    currency: "XOF",
    minOrderQty: product.minimumQuantity,
    unit: "pièce",
    availability: "PreOrder",
    colorVariants: [],
    designOptions: [],
    keySpecs: [
      { label: "Catégorie", value: product.category },
      { label: "Quantité minimale", value: `${product.minimumQuantity} pièce${product.minimumQuantity > 1 ? "s" : ""}` },
      { label: "Délai estimé", value: `${product.leadTimeDays} jours` },
      { label: "Départ", value: `${product.city}, Chine` },
      { label: "Disponibilité", value: product.quantity > 0 ? `${product.quantity} en stock` : "Sur commande" },
    ],
    highlights: [
      { lead: "Précommande groupée :", text: "le prix est indicatif et la livraison reste à confirmer selon la destination." },
      { lead: "Vendeur :", text: `${product.seller}, ${product.university}.` },
    ],
    attributes: [
      { label: "Catégorie", value: product.category },
      { label: "Quantité minimale", value: String(product.minimumQuantity) },
      { label: "Délai estimé", value: `${product.leadTimeDays} jours` },
      { label: "Ville de départ", value: product.city },
      { label: "Vendeur", value: product.seller },
      { label: "Profil", value: product.university },
    ],
    supplier: {
      name: product.seller,
      initials: product.seller.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      country: "Chine",
      countryCode: "CN",
      yearsActive: 1,
      type: "Négociant",
      onlineRevenue: "Non communiqué",
      responseTime: "Non communiqué",
      onTimeShipping: 0,
      rating: product.isDemo ? 0 : product.rating,
      ratingCount: product.isDemo ? 0 : product.reviewCount,
      verified: false,
      profileHref: `/vendeurs/${product.sellerSlug}`,
    },
    shipping: { placeholder: "Sélectionner la livraison", carriers: DEFAULT_CARRIERS },
    faq: [
      { question: "Comment suivre mon expédition ?", answer: "Le suivi apparaît dans « Mes commandes » dès que le vendeur a expédié la commande." },
      { question: "Les frais de livraison sont-ils inclus ?", answer: "Non. Les frais de transport, de douane et de livraison sont confirmés après la commande, selon la destination." },
    ],
    reviews: product.isDemo ? summary(0, 0) : summary(product.rating, product.reviewCount),
    description: { paragraphs: description.split(/\n{2,}/).filter(Boolean), images: [] },
    related: sameCategory.slice(0, 10).map(demoToCard),
    boughtTogether: others.slice(0, 10).map(demoToCard),
    supplierProducts: sameSeller.slice(0, 10).map(demoToCard),
    metaDescription: description.slice(0, 155),
  };
}

function parseRating(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

const recommendationToCard = (item: DetailedProduct["recommendations"][number]): ProductCardData => ({
  id: item.id,
  title: item.title,
  image: item.image,
  priceMin: item.priceRangeXof?.[0] ?? item.priceXof,
  priceMax: item.priceRangeXof?.[1],
  minOrderQty: item.moq,
  colorCount: item.colors,
});

/** Fiche détaillée existante (lib/product.ts) → objet Product. */
export function detailedToProduct(product: DetailedProduct, all: DemoProduct[]): Product {
  const prices = product.tiers.map((tier) => tier.unitPriceXof);
  const base = catalogToProduct(product, all, product.description);
  return {
    ...base,
    breadcrumb: [{ label: "Accueil", href: "/" }, ...product.breadcrumb.map((label, index) => ({ label, href: index === product.breadcrumb.length - 1 ? `/produits?categorie=${product.categorySlug}` : "/produits" }))],
    category: { label: product.breadcrumb[product.breadcrumb.length - 1] || product.category, slug: product.categorySlug },
    images: product.gallery,
    soldCount: product.soldCount,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    availability: "PreOrder",
    colorVariants: product.colorVariants.map((variant) => ({ id: variant.id, label: variant.label, image: product.gallery[variant.imageIndex]?.src || product.gallery[0].src })),
    designLabel: "Fiche / région",
    designOptions: product.plugVariants.map((plug) => ({ id: plug, label: plug })),
    keySpecs: product.keyAttributes,
    attributes: [...product.attributes, ...product.packageAttributes],
    supplier: {
      name: product.supplier.company,
      initials: product.supplier.company.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      country: "Chine",
      countryCode: product.supplier.countryCode,
      yearsActive: product.supplier.yearsActive,
      type: "Fabricant",
      onlineRevenue: "Non communiqué",
      responseTime: product.supplier.responseTime,
      onTimeShipping: Number.parseInt(product.supplier.onTimeDelivery.replace(/\D/g, ""), 10) || 0,
      rating: parseRating(product.supplier.rating),
      ratingCount: product.supplier.reviewCount,
      verified: false,
      profileHref: "/vendeurs",
    },
    highlights: [
      { lead: "Données de démonstration :", text: "prix, variantes, avis et disponibilité à confirmer avec le fournisseur." },
      { lead: "Livraison :", text: product.shipping.disclaimer },
    ],
    related: product.recommendations.map(recommendationToCard),
    boughtTogether: product.frequentlyBought.map(recommendationToCard),
    supplierProducts: base.supplierProducts.length ? base.supplierProducts : product.recommendations.slice(0, 5).map(recommendationToCard),
  };
}

/** Objet attendu par le panier existant (CartProvider). */
export function productToCartItem(product: Product, source?: DemoProduct): DemoProduct {
  if (source) return source;
  return {
    slug: product.slug,
    title: product.title,
    priceXof: product.priceMin,
    minimumQuantity: product.minOrderQty,
    leadTimeDays: 15,
    category: product.category.label,
    categorySlug: product.category.slug,
    seller: product.supplier.name,
    sellerSlug: product.slug,
    university: product.supplier.type,
    city: product.supplier.country,
    rating: product.rating,
    reviewCount: product.reviewsCount,
    icon: "",
    tone: "orange",
    quantity: 1000,
    imageUrl: product.images[0]?.src,
  };
}
