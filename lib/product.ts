import type { DemoProduct } from "@/lib/demo-data";

export type ProductImage = { src: string; alt: string };
export type PriceTier = { minQuantity: number; maxQuantity: number | null; unitPriceXof: number; label: string };
export type ProductVariant = { id: string; label: string; swatch: string; imageIndex: number };
export type ProductAttribute = { label: string; value: string };
export type Recommendation = { id: string; title: string; image: string; priceXof: number; moq: number; priceRangeXof?: [number, number]; colors?: number };

export type DetailedProduct = DemoProduct & {
  breadcrumb: string[];
  soldCount: number;
  tiers: PriceTier[];
  gallery: ProductImage[];
  colorVariants: ProductVariant[];
  plugVariants: string[];
  keyAttributes: ProductAttribute[];
  attributes: ProductAttribute[];
  packageAttributes: ProductAttribute[];
  preparationBands: Array<{ quantity: string; days: string }>;
  supplier: {
    company: string;
    countryCode: string;
    yearsActive: number;
    rating: string;
    reviewCount: number;
    responseTime: string;
    onTimeDelivery: string;
    markets: string[];
    disclaimer: string;
  };
  shipping: { feeXof: number; pieceCount: number; estimatedDate: string; disclaimer: string };
  description: string;
  recommendations: Recommendation[];
  frequentlyBought: Recommendation[];
  similarSearches: string[];
};

const basePhoneImage = "/products/smartphone-generic.jpg";

// Temporary storefront fixture. Replace this object with a Neon/Postgres product record when the catalog API is connected.
export const smartphoneCamon50Pro: DetailedProduct = {
  slug: "smartphone-camon-50-pro",
  title: "Smartphone 5G 50 Pro, 512 Go, Android 15",
  priceXof: 46_172,
  minimumQuantity: 1,
  leadTimeDays: 30,
  category: "Téléphones & high-tech",
  categorySlug: "electronique",
  seller: "Shenzhen Nayu Technology Co. (démo)",
  sellerSlug: "shenzhen-nayu-demo",
  university: "Profil fournisseur illustratif",
  city: "Shenzhen",
  rating: 2.6,
  reviewCount: 3,
  icon: "",
  tone: "blue",
  quantity: 10_000,
  imageUrl: basePhoneImage,
  description: "Quels services pouvons-nous fournir ? Cette fiche présente un exemple de smartphone avec plusieurs variantes. Les caractéristiques, accessoires inclus, compatibilité réseau, prix et modalités d’expédition doivent être confirmés auprès du fournisseur. Aucune commande ni aucun paiement n’est transmis par cette page de démonstration.",
  breadcrumb: ["Électronique grand public", "Téléphones mobiles & radio", "Smartphone 5G"],
  soldCount: 10,
  tiers: [
    { minQuantity: 1, maxQuantity: 19, unitPriceXof: 46_172, label: "1–19 pièces" },
    { minQuantity: 20, maxQuantity: 99, unitPriceXof: 44_325, label: "20–99 pièces" },
    { minQuantity: 100, maxQuantity: 999, unitPriceXof: 41_247, label: "100–999 pièces" },
    { minQuantity: 1_000, maxQuantity: null, unitPriceXof: 32_136, label: "≥ 1 000 pièces" },
  ],
  gallery: [
    { src: basePhoneImage, alt: "Deux vues du smartphone de démonstration, face avant et arrière" },
    { src: "/products/smartphone-front.jpg", alt: "Vue avant du smartphone de démonstration" },
    { src: "/products/smartphone-camera.jpg", alt: "Détail illustratif du bloc photo arrière" },
    { src: "/products/smartphone-orange.jpg", alt: "Smartphone générique en coloris orange" },
    { src: "/products/smartphone-lavender.jpg", alt: "Smartphone générique en coloris lavande" },
    { src: "/products/smartphone-silver.jpg", alt: "Smartphone générique en coloris argent" },
    { src: basePhoneImage, alt: "Vue arrière du smartphone de démonstration" },
    { src: "/products/smartphone-front.jpg", alt: "Écran avant du smartphone de démonstration" },
  ],
  colorVariants: [
    { id: "graphite", label: "Graphite", swatch: "#4b4f54", imageIndex: 0 },
    { id: "orange", label: "Orange", swatch: "#dc773b", imageIndex: 3 },
    { id: "lavender", label: "Lavande", swatch: "#a9a4b8", imageIndex: 4 },
    { id: "silver", label: "Argent", swatch: "#d7d9d9", imageIndex: 5 },
  ],
  plugVariants: ["AU", "UE", "Royaume-Uni", "US"],
  keyAttributes: [
    { label: "Écran", value: "6,9″" },
    { label: "Marque", value: "Other" },
    { label: "Système d’exploitation", value: "Android 15" },
    { label: "Résolution", value: "HD" },
    { label: "Modèle", value: "camon50pro" },
    { label: "Rafraîchissement", value: "120 Hz" },
  ],
  attributes: [
    { label: "Réseau cellulaire", value: "5G" },
    { label: "Capacité de la batterie", value: "6 000–6 999 mAh" },
    { label: "Écran", value: "6,9″" },
    { label: "Type d’affichage", value: "LED" },
    { label: "Caméra arrière", value: "50 MP" },
    { label: "Charge rapide", value: "20–29 W" },
    { label: "Taux de rafraîchissement", value: "120 Hz" },
    { label: "Caméra frontale", value: "32 MP" },
    { label: "Caractéristiques", value: "Caméra beauté, double SIM, jeux" },
    { label: "Système d’exploitation", value: "Android 15" },
    { label: "Langues du système", value: "Anglais, néerlandais, français, allemand, espagnol" },
    { label: "Nom de marque", value: "Other" },
    { label: "Résolution d’écran", value: "HD" },
    { label: "Processeur (CPU)", value: "Deca Core" },
    { label: "Numéro de modèle", value: "camon50pro" },
    { label: "Lieu d’origine", value: "Guangdong, Chine" },
    { label: "Bandes de fréquence", value: "LTE / 5G" },
  ],
  packageAttributes: [
    { label: "Unités de vente", value: "Article unique" },
    { label: "Taille du paquet", value: "20 × 15 × 10 cm" },
    { label: "Poids brut", value: "0,5 kg" },
  ],
  preparationBands: [
    { quantity: "1–5", days: "7 jours" },
    { quantity: "6–7", days: "15 jours" },
    { quantity: "> 7", days: "À négocier" },
  ],
  supplier: {
    company: "Shenzhen Nayu Technology Co., Ltd.",
    countryCode: "CN",
    yearsActive: 9,
    rating: "3,3/5",
    reviewCount: 637,
    responseTime: "≤ 4 h",
    onTimeDelivery: "≥ 62 %",
    markets: ["Côte d’Ivoire", "États-Unis", "Zambie", "Japon"],
    disclaimer: "Profil, ancienneté, évaluations et indicateurs de démonstration. Aucune vérification indépendante n’est revendiquée.",
  },
  shipping: {
    feeXof: 43_974,
    pieceCount: 1,
    estimatedDate: "20 novembre 2026",
    disclaimer: "Estimation de démonstration pour une pièce. Frais, itinéraire et date de livraison à confirmer; disponibilité non garantie.",
  },
  recommendations: [
    { id: "phone-512", title: "Smartphone 5G, 512 Go, double SIM", image: basePhoneImage, priceXof: 46_172, moq: 1 },
    { id: "phone-android", title: "Téléphone Android grand écran", image: "/products/smartphone-front.jpg", priceXof: 46_172, moq: 1 },
    { id: "phone-camera", title: "Smartphone photo haute définition", image: "/products/smartphone-camera.jpg", priceXof: 41_247, moq: 2 },
    { id: "watch-steel", title: "Montre connectée, bracelet acier", image: "/product-watch.jpg", priceXof: 15_822, moq: 2, priceRangeXof: [15_822, 22_015], colors: 8 },
    { id: "wireless-earbuds", title: "Écouteurs Bluetooth sans fil", image: "/product-audio.jpg", priceXof: 14_500, moq: 2 },
    { id: "power-bank", title: "Batterie externe compacte", image: "/products/tech-powerbank.jpg", priceXof: 13_500, moq: 2 },
    { id: "charger", title: "Chargeur USB-C multiport", image: "/products/tech-charger.png", priceXof: 10_000, moq: 2 },
  ],
  frequentlyBought: [
    { id: "watch-band", title: "Bracelet de sport noir respirant", image: "/products/fashion-bracelet.jpg", priceXof: 3_072, moq: 2, colors: 6 },
    { id: "watch-sport", title: "Bracelet sport souple pour montre", image: "/products/fashion-belt.jpg", priceXof: 2_450, moq: 2, colors: 6 },
    { id: "watch-silicone", title: "Bracelet silicone compatible", image: "/product-watch.jpg", priceXof: 5_850, moq: 2 },
    { id: "band-wholesale", title: "Lot de bracelets de montre", image: "/products/fashion-bracelet.jpg", priceXof: 2_040, moq: 2, colors: 6 },
    { id: "case-watch", title: "Protection pour montre connectée", image: "/products/home-mirror.jpg", priceXof: 1_435, moq: 2 },
    { id: "watch-orange", title: "Montre sport avec bracelet orange", image: "/product-watch.jpg", priceXof: 7_911, moq: 2, colors: 4 },
    { id: "charger-usbc", title: "Câble et chargeur USB-C", image: "/products/tech-charger.png", priceXof: 4_195, moq: 3 },
  ],
  similarSearches: ["double carte SIM smartphone", "téléphone mobile japonais", "smartphone 5G gros", "téléphone Android grand écran", "téléphone mobile 8 pouces"],
};

export function priceTierForQuantity(product: DetailedProduct, quantity: number): PriceTier {
  return product.tiers.find((tier) => quantity >= tier.minQuantity && (tier.maxQuantity === null || quantity <= tier.maxQuantity))
    || product.tiers[product.tiers.length - 1]
    || { minQuantity: product.minimumQuantity, maxQuantity: null, unitPriceXof: product.priceXof, label: "À confirmer" };
}
