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
  /** Seuil de promotion affiché sur les cartes : « -20 % ». */
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://mybigmarket.vercel.app",
} as const;

export const whatsappLink = (message = "Bonjour MyBigMarket, j'ai une question sur un produit.") =>
  `https://wa.me/${SHOP.whatsappNumber}?text=${encodeURIComponent(message)}`;

/** Textes de la bande du haut et de la réassurance. */
export const TOP_STRIP = "Livraison à Abidjan et partout en Côte d'Ivoire  •  Paiement à la livraison  •  WhatsApp";

export const REASSURANCE = [
  { title: "Livraison à Abidjan et en Côte d'Ivoire", text: "En stock à Abidjan : 24 à 72 h" },
  { title: "Paiement à la livraison", text: "Vous payez à la réception du produit" },
  { title: "Retours sous 7 jours", text: "Si le produit ne convient pas ou arrive abîmé" },
  { title: "Service client WhatsApp", text: `${SHOP.phoneDisplay}, ${SHOP.hours.toLowerCase()}` },
];

/** Moyens de paiement : seul le paiement à la livraison est actif pour l'instant. */
export const PAYMENT_METHODS = [
  { code: "cash_on_delivery", label: "Paiement à la livraison", active: true },
  { code: "orange_money", label: "Orange Money", active: false },
  { code: "mtn_momo", label: "MTN Mobile Money", active: false },
  { code: "moov_money", label: "Moov Money", active: false },
  { code: "wave", label: "Wave", active: false },
] as const;
