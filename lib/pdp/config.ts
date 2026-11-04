/**
 * Libellés génériques et configurables de la fiche produit.
 * Changez-les ici : aucun nom de marque tierce n'est utilisé dans les composants.
 */
export const pdpConfig = {
  protectionProgram: "Protection des commandes",
  securePaymentsTitle: "Paiements sécurisés",
  securePaymentsText: "Les informations de paiement sont chiffrées (SSL) et ne sont jamais partagées avec le vendeur.",
  refundTitle: "Protection de remboursement",
  refundText: "Remboursement si la commande n'est pas expédiée, est manquante ou arrive avec des problèmes de qualité.",
  /** Moyens de paiement affichés sous forme de pastilles texte (pas de logos tiers). */
  paymentMethods: ["Visa", "Mastercard", "Mobile Money", "Wave"],
  guaranteeNote: "Commande protégée de la confirmation à la livraison, sous réserve des conditions de vente.",
  imageSearch: "Recherche par image",
  messaging: "Messagerie",
  backToTop: "Haut de page",
  supplierVerification: "Vérification des fournisseurs",
  supplierReport: "Générer un rapport",
  analysisTitle: "Autres analyses et recherches sur ce produit",
  marginCta: "Calculer le coût et la marge",
  dropshipping: {
    title: "Faites-vous livrer directement ce produit dans votre boutique",
    cta: "Commencez le dropshipping",
    href: "/vendeur",
    /** Intégrations e-commerce affichées en pastilles (initiales). */
    integrations: [
      { label: "Boutique Shopify", icon: "bag" },
      { label: "WooCommerce", icon: "cart" },
      { label: "Site Wix", icon: "globe" },
      { label: "Boutique physique", icon: "store" },
      { label: "Connexion API", icon: "code" },
    ],
  },
  tabs: [
    { id: "pdp-attributes", label: "Attribut" },
    { id: "pdp-reviews", label: "Avis" },
    { id: "pdp-supplier-section", label: "Fournisseur" },
    { id: "pdp-description", label: "Description" },
  ],
  /** Nombre de vignettes de couleur affichées avant « +N ». */
  colorThumbLimit: { full: 9, compact: 5 },
  /** Longueur au-delà de laquelle une valeur d'attribut est tronquée. */
  attributeTruncate: 60,
} as const;

/** Liens de l'en-tête du site (menu secondaire). */
export const headerNav = {
  primary: [
    { label: "Toutes les catégories", href: "/produits", icon: "menu" },
    { label: "Fabricants vérifiés", href: "/vendeurs", icon: "badge" },
    { label: "Dropshipping", href: "/vendeur", icon: "truck" },
  ],
  secondary: [
    { label: "À propos", href: "/comment-ca-marche" },
    { label: "Centre d'aide", href: "/comment-ca-marche#aide" },
    { label: "Vendre sur la plateforme", href: "/vendeur" },
  ],
} as const;
