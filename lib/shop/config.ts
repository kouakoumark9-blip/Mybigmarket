/**
 * Réglages de la boutique : à modifier ici, un seul endroit.
 * Les prix sont en FCFA (XOF). Marché : Côte d'Ivoire.
 */
export const SHOP = {
  name: "MyBigMarket",
  /** Numéro affiché partout et utilisé pour WhatsApp (format international, sans « + »). */
  whatsappNumber: "2250767537998",
  phoneDisplay: "07 67 53 79 98",
  email: "contact@mybigmarket.ci",
  hours: "Du lundi au samedi, de 8 h à 19 h",
  city: "Abidjan, Côte d'Ivoire",
  /** Phrase d'identité reprise sur l'accueil, le pied de page, la page À propos et les données structurées (Google). */
  officialStatement: "MyBigMarket est le fournisseur officiel de la marque CIL (Compagnie Ivoirienne de Literie) en Côte d'Ivoire, ainsi que de lits, de matelas, d'oreillers et de canapés.",
  /** Seuil de promotion affiché sur les cartes : « -20 % ». */
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.vercel.app",
} as const;

export const whatsappLink = (message = "Bonjour MyBigMarket, j'ai une question sur un produit.") =>
  `https://wa.me/${SHOP.whatsappNumber}?text=${encodeURIComponent(message)}`;

/** Textes de la bande du haut et de la réassurance. */
export const TOP_STRIP = "Livraison à Abidjan et partout en Côte d'Ivoire  •  Paiement mobile money  •  WhatsApp";

export const REASSURANCE = [
  { title: "Paiement mobile money sécurisé", text: "Orange, MTN, Moov, Wave" },
  { title: "Livraison à Abidjan", text: "En stock : 24 à 72 h" },
  { title: "Produits vérifiés", text: "Contrôlés avant l'envoi" },
  { title: "Service client WhatsApp", text: "Du lundi au samedi, 8 h à 19 h" },
];

/** Moyens de paiement : mobile money uniquement. */
export const PAYMENT_METHODS = [
  { code: "orange_money", label: "Orange Money" },
  { code: "mtn_momo", label: "MTN MoMo" },
  { code: "moov_money", label: "Moov Money" },
  { code: "wave", label: "Wave" },
] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHODS)[number]["code"];
export const paymentLabel = (code: string) => PAYMENT_METHODS.find((method) => method.code === code)?.label ?? "Mobile money";
