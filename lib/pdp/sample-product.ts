import type { Product } from "@/lib/pdp/types";

const img = (name: string) => `/placeholders/watch/${name}.svg`;

const colors: Array<[string, string]> = [
  ["noir", "Noir"], ["argent", "Argent"], ["or", "Or"], ["or-rose", "Or rose"], ["bleu-nuit", "Bleu nuit"],
  ["vert-olive", "Vert olive"], ["bordeaux", "Bordeaux"], ["sable", "Sable"], ["blanc", "Blanc"],
  ["gris", "Gris"], ["marron", "Marron"], ["bleu-ciel", "Bleu ciel"], ["rouge", "Rouge"], ["orange", "Orange"],
];

/**
 * Produit d'exemple : données fictives, visuels de remplacement générés pour le projet.
 * Il sert de référence pour le format attendu d'un objet Product.
 */
export const sampleWatchProduct: Product = {
  id: "demo-montre-quartz-acier",
  slug: "montre-quartz-acier-demo",
  title: "Montre à quartz pour homme, boîtier en acier inoxydable 42 mm, bracelet interchangeable, étanche 3 ATM, plusieurs coloris disponibles",
  breadcrumb: [
    { label: "Accueil", href: "/" },
    { label: "Mode & accessoires", href: "/produits?categorie=mode-accessoires" },
    { label: "Montres", href: "/produits?categorie=mode-accessoires&q=montre" },
    { label: "Montres à quartz", href: "/produits?q=montre%20quartz" },
  ],
  category: { label: "Montres à quartz", slug: "mode-accessoires" },
  images: [
    { src: img("vue-face"), alt: "Montre à quartz, vue de face, cadran blanc et bracelet noir" },
    { src: img("vue-profil"), alt: "Montre à quartz vue de profil" },
    { src: img("vue-cadran"), alt: "Détail du cadran avec index et aiguilles" },
    { src: img("vue-bracelet"), alt: "Bracelet marron interchangeable" },
    { src: img("vue-coffret"), alt: "Montre présentée dans son coffret" },
    { src: img("vue-dimensions"), alt: "Dimensions : cadran 42 mm, bracelet 22 mm" },
  ],
  videoUrl: undefined,
  imageLabel: "Coloris personnalisables",
  rating: 5,
  reviewsCount: 1,
  soldCount: 67,
  rankLabel: "#3 les plus populaires dans Montres à quartz pour homme",
  priceMin: 919,
  priceMax: 1409,
  currency: "XOF",
  unit: "pièce",
  lowestPriceBadge: "Prix les plus bas depuis 180 jours",
  availability: "InStock",
  colorVariants: colors.map(([id, label]) => ({ id, label, image: img(`montre-${id}`) })),
  designLabel: "Conception",
  designOptions: [
    { id: "classique", label: "Classique 3 aiguilles" },
    { id: "chrono", label: "Chronographe" },
    { id: "date", label: "Avec date" },
  ],
  keySpecs: [
    { label: "Diamètre du cadran", value: "42 mm" },
    { label: "Type de fermoir", value: "Boucle ardillon" },
    { label: "Matériau du boîtier", value: "Acier inoxydable" },
    { label: "Mouvement", value: "Quartz" },
    { label: "Largeur de bande", value: "22 mm" },
    { label: "Étanchéité", value: "3 ATM" },
  ],
  highlights: [
    { lead: "Personnalisation :", text: "logo gravé au dos du boîtier possible à partir de 50 pièces." },
    { lead: "Emballage :", text: "livrée en coffret individuel avec notice en français." },
  ],
  attributes: [
    { label: "Mouvement", value: "Quartz" },
    { label: "Diamètre du cadran", value: "42 mm" },
    { label: "Épaisseur du boîtier", value: "10 mm" },
    { label: "Matériau du boîtier", value: "Acier inoxydable 316L" },
    { label: "Matériau du bracelet", value: "Cuir synthétique, silicone ou maille acier selon le coloris" },
    { label: "Largeur de bande", value: "22 mm" },
    { label: "Type de fermoir", value: "Boucle ardillon" },
    { label: "Étanchéité", value: "3 ATM (résiste aux éclaboussures, ne pas immerger)" },
    { label: "Verre", value: "Minéral trempé" },
    { label: "Lieu d'origine", value: "Guangdong, Chine" },
    { label: "Garantie", value: "12 mois" },
    { label: "Personnalisation", value: "Logo gravé, couleur du cadran, couleur du bracelet et emballage personnalisé disponibles à partir de 50 pièces par modèle, délai supplémentaire de 7 jours ouvrés" },
  ],
  supplier: {
    name: "Atelier Horloger Delta",
    initials: "AD",
    country: "Chine",
    countryCode: "CN",
    yearsActive: 7,
    type: "Fabricant",
    onlineRevenue: "250 000 $+",
    responseTime: "≤ 3 h",
    onTimeShipping: 96,
    rating: 4.4,
    ratingCount: 128,
    verified: true,
    profileHref: "/vendeurs",
  },
  shipping: {
    placeholder: "Sélectionner la livraison",
    carriers: [
      { id: "air", label: "Fret aérien groupé", delay: "10 à 15 jours", feeXof: 2500 },
      { id: "express", label: "Express porte-à-porte", delay: "5 à 8 jours", feeXof: 6500 },
      { id: "sea", label: "Fret maritime", delay: "35 à 50 jours", feeXof: 900 },
    ],
  },
  faq: [
    { question: "Comment suivre mon expédition ?", answer: "Un numéro de suivi est ajouté à votre commande dès l'expédition. Vous le retrouvez dans « Mes commandes » et recevez une notification à chaque étape." },
    { question: "Puis-je commander un échantillon ?", answer: "Oui, vous pouvez commander une seule pièce. Le prix unitaire baisse à partir de 50 pièces." },
    { question: "Quels sont les délais de préparation ?", answer: "Comptez 3 à 5 jours ouvrés pour les coloris en stock et 7 jours supplémentaires pour une personnalisation." },
  ],
  reviews: {
    average: 5,
    count: 1,
    distribution: [1, 0, 0, 0, 0],
    items: [
      { id: "r1", author: "K. Aminata", country: "Côte d'Ivoire", rating: 5, date: "2026-10-12", text: "Montres conformes aux photos, bien emballées. Les bracelets se changent facilement, mes clientes apprécient.", photos: [{ src: img("avis-1"), alt: "Photo client : montre noire reçue" }, { src: img("avis-2"), alt: "Photo client : montre or reçue" }], verified: true },
    ],
  },
  description: {
    paragraphs: [
      "Montre à quartz au boîtier en acier inoxydable de 42 mm, pensée pour la revente en boutique : un design sobre, un bracelet interchangeable sans outil et une large palette de coloris.",
      "Chaque montre est livrée réglée, avec pile installée, dans un coffret individuel. Les visuels de cette fiche sont des illustrations de remplacement.",
    ],
    images: [
      { src: img("description-1"), alt: "Présentation de la montre et de ses principales caractéristiques" },
      { src: img("description-2"), alt: "Quatre coloris de cadran présentés côte à côte" },
    ],
  },
  related: [
    { id: "rel-1", title: "Montre minimaliste cadran blanc, bracelet maille", image: img("montre-argent"), priceMin: 1050, priceMax: 1600, swatches: ["#c9cdd2", "#23262b", "#d2a85a"], colorCount: 26 },
    { id: "rel-2", title: "Montre sport silicone, étanche 5 ATM", image: img("montre-bleu-nuit"), priceMin: 780, priceMax: 1190, swatches: ["#1f3557", "#b4362f", "#23262b"], colorCount: 12, compareAtPrice: 1320, discountPercent: 10 },
    { id: "rel-3", title: "Montre femme cadran nacré, boîtier or rose", image: img("montre-or-rose"), priceMin: 1250, priceMax: 1890, swatches: ["#d99b84", "#d2a85a", "#c9cdd2"], colorCount: 8 },
    { id: "rel-4", title: "Montre chronographe acier, verre minéral", image: img("montre-gris"), priceMin: 2400, priceMax: 3100 },
    { id: "rel-5", title: "Montre vintage bracelet cuir marron", image: img("montre-marron"), priceMin: 990, priceMax: 1350, swatches: ["#6b4a33", "#23262b", "#cdb894"], colorCount: 6 },
    { id: "rel-6", title: "Montre enfant colorée, bracelet souple", image: img("montre-orange"), priceMin: 520, priceMax: 760, swatches: ["#e0782e", "#8fb6d9", "#b4362f"], colorCount: 18, compareAtPrice: 840, discountPercent: 10 },
    { id: "rel-7", title: "Montre ultra-fine 6 mm, cadran noir", image: img("montre-noir"), priceMin: 1600, priceMax: 2200 },
  ],
  boughtTogether: [
    { id: "bt-1", title: "Bracelet de rechange 22 mm, silicone", image: img("montre-vert-olive"), priceMin: 180, priceMax: 260, swatches: ["#5d6b3c", "#23262b", "#1f3557"], colorCount: 20 },
    { id: "bt-2", title: "Coffret cadeau pour montre, logo personnalisable", image: img("vue-coffret"), priceMin: 240, priceMax: 410 },
    { id: "bt-3", title: "Lot de piles bouton pour montre", image: img("montre-blanc"), priceMin: 95 },
    { id: "bt-4", title: "Bracelet cuir 22 mm, coutures contrastées", image: img("montre-bordeaux"), priceMin: 320, priceMax: 480, swatches: ["#6e2335", "#6b4a33", "#23262b"], colorCount: 9, compareAtPrice: 530, discountPercent: 10 },
    { id: "bt-5", title: "Présentoir de montres 6 emplacements", image: img("montre-sable"), priceMin: 2900 },
    { id: "bt-6", title: "Kit d'outils pour changer les bracelets", image: img("montre-gris"), priceMin: 650 },
  ],
  supplierProducts: [
    { id: "sp-1", title: "Montre quartz cadran bleu, bracelet maille", image: img("montre-bleu-ciel"), priceMin: 1100, priceMax: 1480, swatches: ["#8fb6d9", "#c9cdd2", "#23262b"], colorCount: 14 },
    { id: "sp-2", title: "Montre classique dorée, cadran champagne", image: img("montre-or"), priceMin: 1350, priceMax: 1700 },
    { id: "sp-3", title: "Montre militaire bracelet toile", image: img("montre-vert-olive"), priceMin: 890, priceMax: 1200, compareAtPrice: 1330, discountPercent: 10 },
    { id: "sp-4", title: "Montre rouge édition sport", image: img("montre-rouge"), priceMin: 940, priceMax: 1260, swatches: ["#b4362f", "#23262b", "#eeeeea"], colorCount: 5 },
    { id: "sp-5", title: "Montre cadran sable, bracelet cuir", image: img("montre-sable"), priceMin: 1020, priceMax: 1390 },
    { id: "sp-6", title: "Montre unisexe cadran noir mat", image: img("montre-noir"), priceMin: 870, priceMax: 1150 },
  ],
  metaDescription: "Montre à quartz 42 mm en acier inoxydable, bracelet interchangeable, 14 coloris. Prix de 919 à 1 409 FCFA, dès 1 pièce. Livraison vers l'Afrique de l'Ouest à confirmer.",
};
