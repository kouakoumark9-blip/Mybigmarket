import type { DemoProduct } from "@/lib/demo-data";
import type { Product, ProductCardData, ReviewSummary } from "@/lib/pdp/types";
import { SHOP } from "@/lib/shop/config";
import { discountPercent } from "@/lib/shop/format";

/** Année de lancement de la boutique, affichée dans la carte « vendeur » de la fiche produit. À ajuster. */
const SHOP_YEARS_ACTIVE = 1;

/** Note globale inconnue : on ne l'invente pas. */
const noReviews = (): ReviewSummary => ({ average: 0, count: 0, items: [] });

export function demoToCard(product: DemoProduct): ProductCardData {
  const percent = discountPercent(product.priceXof, product.comparePriceXof);
  return {
    id: product.slug,
    slug: product.slug,
    title: product.title,
    image: product.imageUrl || "/product-home.jpg",
    priceMin: product.priceXof,
    ...(percent ? { compareAtPrice: product.comparePriceXof ?? undefined, discountPercent: percent } : {}),
  };
}

const FAQ: Product["faq"] = [
  { question: "Quand vais-je être livré ?", answer: "Produit en stock : livraison en 24 à 72 h. Produit sur commande : le délai est indiqué sur la fiche et dans votre panier. Hors Abidjan, comptez quelques jours de plus." },
  { question: "Comment payer ?", answer: "Par mobile money : Orange Money, MTN MoMo, Moov Money ou Wave. Après votre commande, je vous envoie les instructions de paiement sur WhatsApp." },
  { question: "Puis-je retourner un produit ?", answer: "Oui, sous 7 jours si le produit ne convient pas ou arrive abîmé. Contactez-nous sur WhatsApp avec votre numéro de commande." },
];

/** Produit du catalogue (base de données) → objet Product de la fiche. */
export function catalogToProduct(product: DemoProduct, all: DemoProduct[], description: string): Product {
  const sameCategory = all.filter((item) => item.categorySlug === product.categorySlug && item.slug !== product.slug);
  const others = all.filter((item) => item.slug !== product.slug);
  const percent = discountPercent(product.priceXof, product.comparePriceXof);
  const gallery = product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : ["/product-home.jpg"];
  const delivery = product.availabilityLabel ?? "Livraison à confirmer";
  const specs = [
    { label: "Disponibilité", value: delivery },
    ...(product.brandName ? [{ label: "Marque", value: product.brandName }] : []),
    ...(product.powerLabel ? [{ label: "Puissance", value: product.powerLabel }] : []),
    ...(product.energyClass ? [{ label: "Classe énergétique", value: product.energyClass }] : []),
  ];
  const variants = product.variants ?? [];
  const prices = variants.map((variant) => variant.priceXof);
  const inStock = product.availability !== "on_order" && (variants.length ? variants.some((variant) => variant.quantity > 0) : product.quantity > 0);
  return {
    id: product.slug,
    slug: product.slug,
    title: product.title,
    breadcrumb: [{ label: "Accueil", href: "/" }, ...(product.categoryTrail?.length ? product.categoryTrail : [{ label: product.category, href: "/produits" }])],
    category: { label: product.category, slug: product.categorySlug },
    images: gallery.map((src) => ({ src, alt: product.title })),
    rating: 0,
    reviewsCount: 0,
    soldCount: 0,
    priceMin: prices.length ? Math.min(...prices) : product.priceXof,
    priceMax: prices.length ? Math.max(...prices) : product.priceXof,
    currency: "XOF",
    unit: "pièce",
    lowestPriceBadge: percent ? `Promotion : -${percent} %` : undefined,
    availability: inStock ? "InStock" : "PreOrder",
    colorVariants: [],
    designOptions: variants.map((variant) => ({ id: String(variant.id), label: variant.label })),
    ...(variants.length ? { designLabel: "Taille" } : {}),
    keySpecs: specs,
    summary: product.shortDescription || description.split(/\n{2,}/)[0] || "",
    highlights: [
      { lead: "Livraison :", text: delivery + "." },
      { lead: "Paiement :", text: "par mobile money (Orange Money, MTN MoMo, Moov Money, Wave)." },
      { lead: "Retours :", text: "sous 7 jours si le produit ne convient pas ou arrive abîmé." },
    ],
    attributes: [{ label: "Catégorie", value: product.category }, ...(product.extraAttributes ?? []), ...(product.brandName && !product.extraAttributes?.some((item) => item.label === "Marque") ? [{ label: "Marque", value: product.brandName }] : [])],
    supplier: {
      name: SHOP.name,
      initials: "MB",
      country: "Côte d'Ivoire",
      countryCode: "CI",
      yearsActive: SHOP_YEARS_ACTIVE,
      type: "Négociant",
      onlineRevenue: "Non communiqué",
      responseTime: "Non communiqué",
      onTimeShipping: 0,
      rating: 0,
      ratingCount: 0,
      verified: false,
      profileHref: "/a-propos",
    },
    shipping: {
      placeholder: "Livraison à Abidjan et en Côte d'Ivoire, frais selon la commune",
      carriers: [
        { id: "abidjan", label: "Livraison à Abidjan (2 000 à 4 500 FCFA selon la commune)", delay: product.availability === "on_order" ? `sous ${product.leadTimeDays} jours` : "24 à 72 h" },
        { id: "ci", label: "Livraison dans les autres villes (à partir de 5 000 FCFA)", delay: product.availability === "on_order" ? `sous ${product.leadTimeDays + 5} jours` : "2 à 7 jours" },
      ],
    },
    faq: FAQ,
    reviews: noReviews(),
    description: { paragraphs: description.split(/\n{2,}/).filter(Boolean), images: [] },
    related: sameCategory.slice(0, 10).map(demoToCard),
    boughtTogether: others.filter((item) => item.categorySlug !== product.categorySlug).slice(0, 10).map(demoToCard),
    supplierProducts: others.slice(0, 10).map(demoToCard),
    seoTitle: product.seoTitle?.trim() || undefined,
    brand: product.brandName ? { name: product.brandName, logo: product.brandLogo || undefined, tagline: product.brandTagline || undefined } : undefined,
    metaDescription: product.seoDescription?.trim() || (`${product.shortDescription || description}`.replace(/\s+/g, " ").slice(0, 120) + ` Livraison à Abidjan et en Côte d'Ivoire.`),
  };
}

/** Objet attendu par le panier (CartProvider). */
export function productToCartItem(product: Product, source?: DemoProduct): DemoProduct {
  if (source) return source;
  return {
    slug: product.slug,
    title: product.title,
    priceXof: product.priceMin,
    leadTimeDays: 15,
    category: product.category.label,
    categorySlug: product.category.slug,
    seller: SHOP.name,
    sellerSlug: "mybigmarket",
    university: "Boutique en ligne",
    city: "Abidjan",
    rating: 0,
    reviewCount: 0,
    icon: "",
    tone: "orange",
    quantity: 0,
    imageUrl: product.images[0]?.src,
  };
}
