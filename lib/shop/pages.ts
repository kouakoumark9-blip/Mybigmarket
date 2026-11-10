/**
 * Pages d'information. Pour modifier un texte : changez-le ici (title, description, sections).
 * Chaque section a un titre (h) et des paragraphes (p) ou une liste (ul).
 */
import { SHOP } from "./config";

export type InfoSection = { h?: string; p?: string[]; ul?: string[]; ol?: string[] };
export type InfoPage = { slug: string; title: string; metaTitle: string; description: string; intro: string; sections: InfoSection[] };

/** Informations légales à compléter par la vendeuse (affichées sur la page Mentions légales si elles sont renseignées). */
export const LEGAL = {
  ownerName: "",
  registration: "",
  address: "",
};

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "a-propos", title: "À propos de MyBigMarket", metaTitle: "À propos | MyBigMarket, boutique en ligne à Abidjan",
    description: "MyBigMarket est une boutique en ligne d'Abidjan : lits de toutes tailles, lits enfants, superposés, en bois ou en métal, livrés partout en Côte d'Ivoire.",
    intro: "MyBigMarket est une boutique en ligne basée à Abidjan. Je vends moi-même les produits que vous voyez sur le site.",
    sections: [
      { h: "Qui vend ?", p: ["C'est une seule et même boutique : les produits sont choisis, achetés et préparés par moi, et vous parlez toujours à la même personne, avant et après l'achat.", "Une partie des produits est en stock à Abidjan, livrable en 24 à 72 h. Les autres sont commandés auprès de fournisseurs à l'étranger : dans ce cas, la fiche indique « Sur commande » avec le délai de livraison."] },
      { h: "Ce que vous trouvez ici", ul: ["Lits par taille : 1 place, 2 places, 2,5 places, 3 places", "Lits par type : enfants, superposés, pliables, mezzanine, avec chevets, avec rangement", "Lits en bois et lits en métal", "Packs lit + matelas"] },
      { h: "Une question avant d'acheter ?", p: ["Écrivez-moi sur WhatsApp : je réponds du lundi au samedi, de 8 h à 19 h. Je peux vous aider à choisir la taille de lit qui convient à votre chambre."] },
    ],
  },
  {
    slug: "comment-commander", title: "Comment commander", metaTitle: "Comment commander | MyBigMarket Abidjan",
    description: "Commander en 4 étapes sur MyBigMarket : choisissez, remplissez votre adresse, payez par mobile money. Sans compte à créer.",
    intro: "Aucun compte à créer. La commande tient sur une seule page.",
    sections: [
      { ol: ["Ajoutez les produits à votre panier.", "Ouvrez le panier, puis cliquez sur « Commander ».", "Indiquez votre nom, votre téléphone, votre commune et une adresse précise (quartier, rue, repère).", "Choisissez votre mobile money (Orange Money, MTN MoMo, Moov Money ou Wave) puis validez : vous recevez un numéro de commande.", "Je vous envoie sur WhatsApp les instructions de paiement, puis je confirme la livraison."] },
      { h: "Paiement", p: ["Le paiement se fait uniquement par mobile money : Orange Money, MTN MoMo, Moov Money ou Wave. Après votre commande, je vous envoie les instructions de paiement sur WhatsApp."] },
      { h: "Suivre ma commande", p: ["Gardez votre numéro de commande (par exemple MBM-250101-AB12). Vous pouvez suivre l'état de la commande sur la page « Suivi de commande », ou m'écrire sur WhatsApp."] },
    ],
  },
  {
    slug: "livraison", title: "Livraison", metaTitle: "Livraison à Abidjan et en Côte d'Ivoire | MyBigMarket",
    description: "Livraison à Abidjan en 24 à 72 h pour les produits en stock, frais selon la commune. Livraison dans toute la Côte d'Ivoire.",
    intro: "Je livre à Abidjan et dans toute la Côte d'Ivoire. Le délai dépend du produit : il est toujours affiché sur la fiche et dans votre panier.",
    sections: [
      { h: "Délais", ul: ["En stock à Abidjan : livraison en 24 à 72 h.", "Sur commande : le délai est indiqué sur la fiche produit (par exemple « sous 20 jours »). Je ne promets que ce que je peux tenir.", "Hors d'Abidjan : comptez 2 à 7 jours de plus selon la ville."] },
      { h: "Frais de livraison", p: ["Les frais dépendent de votre commune et sont affichés à l'étape de commande, avant que vous validiez. À titre d'exemple : 2 000 FCFA à Cocody, Plateau, Marcory et Treichville ; 3 000 FCFA à Yopougon et Abobo ; à partir de 5 000 FCFA dans les autres villes."] },
      { h: "À la réception", p: ["Vérifiez le produit devant le livreur. En cas de problème (produit abîmé, erreur de modèle), refusez la livraison ou prévenez-moi immédiatement sur WhatsApp."] },
    ],
  },
  {
    slug: "retours-et-remboursements", title: "Retours et remboursements", metaTitle: "Retours et remboursements | MyBigMarket",
    description: "Retour possible sous 7 jours si le produit ne convient pas ou arrive abîmé. Remboursement après réception du produit.",
    intro: "Si le produit ne convient pas ou arrive abîmé, vous avez 7 jours pour me le signaler.",
    sections: [
      { h: "Conditions du retour", ul: ["Prévenez-moi sur WhatsApp dans les 7 jours suivant la livraison, avec votre numéro de commande.", "Le produit doit être dans son emballage d'origine, complet et sans trace d'usage.", "Les produits installés ou utilisés ne sont pas repris, sauf défaut."] },
      { h: "Produit abîmé ou défectueux", p: ["Envoyez-moi une photo ou une courte vidéo. Je remplace le produit ou je vous rembourse, selon votre choix et selon la disponibilité."] },
      { h: "Remboursement", p: ["Le remboursement est fait après réception et vérification du produit retourné, par le même moyen mobile money que celui utilisé pour payer. Les frais de livraison d'un retour dû à une erreur de ma part sont à ma charge."] },
    ],
  },
  {
    slug: "conditions-de-vente", title: "Conditions de vente", metaTitle: "Conditions de vente | MyBigMarket",
    description: "Conditions de vente de MyBigMarket : prix en FCFA, commande, paiement par mobile money, garantie, retours.",
    intro: "Ces conditions s'appliquent à toute commande passée sur MyBigMarket.",
    sections: [
      { h: "Prix", p: ["Les prix sont indiqués en francs CFA (FCFA), toutes taxes comprises, hors frais de livraison. Les frais de livraison sont affichés avant la validation de la commande."] },
      { h: "Commande", p: ["La commande est enregistrée quand vous la validez sur le site. Je la confirme ensuite par téléphone ou WhatsApp. Si un produit n'est plus disponible, je vous préviens et vous pouvez choisir un autre produit ou annuler sans frais."] },
      { h: "Paiement", p: ["Le paiement se fait uniquement par mobile money (Orange Money, MTN MoMo, Moov Money, Wave). Je vous envoie les instructions de paiement après votre commande."] },
      { h: "Disponibilité et délais", p: ["Chaque produit indique s'il est en stock à Abidjan ou sur commande, avec le délai de livraison prévu. Ces délais sont des estimations de bonne foi ; en cas de retard important, je vous contacte."] },
      { h: "Garantie", p: ["La durée de garantie est indiquée sur chaque fiche produit. Pour l'utiliser, contactez-moi avec votre numéro de commande."] },
      { h: "Retours", p: ["Voir la page Retours et remboursements."] },
      { h: "Litiges", p: ["En cas de difficulté, contactez-moi d'abord : la plupart des problèmes se règlent par un message. À défaut, les tribunaux d'Abidjan sont compétents."] },
    ],
  },
  {
    slug: "confidentialite", title: "Confidentialité", metaTitle: "Confidentialité et données personnelles | MyBigMarket",
    description: "Données collectées par MyBigMarket (nom, téléphone, adresse), pourquoi, combien de temps, et comment les faire supprimer.",
    intro: "Je collecte le strict nécessaire pour livrer votre commande.",
    sections: [
      { h: "Ce que je collecte", ul: ["Nom, numéro de téléphone, commune et adresse de livraison.", "Les produits commandés et le montant.", "Un message éventuel que vous écrivez dans la commande."] },
      { h: "Pourquoi", p: ["Uniquement pour confirmer, préparer et livrer votre commande, et pour vous répondre en cas de question. Vos données ne sont ni vendues ni cédées. Elles sont transmises au livreur pour la livraison."] },
      { h: "Combien de temps", p: ["Les commandes sont conservées le temps nécessaire à la garantie et aux obligations comptables."] },
      { h: "Vos droits", p: ["Vous pouvez demander à voir, corriger ou supprimer vos données en m'écrivant sur WhatsApp ou par e-mail."] },
      { h: "Cookies", p: ["Le site garde votre panier et vos favoris dans votre navigateur. Il n'utilise pas de cookie publicitaire."] },
    ],
  },
  {
    slug: "mentions-legales", title: "Mentions légales", metaTitle: "Mentions légales | MyBigMarket",
    description: "Mentions légales du site MyBigMarket : éditeur, hébergeur, contact.",
    intro: "Informations sur l'éditeur du site.",
    sections: [
      { h: "Éditeur du site", p: ["MyBigMarket est une boutique en ligne exploitée par une personne physique, à Abidjan (Côte d'Ivoire).", "Contact : WhatsApp ou téléphone, voir la page Contact."] },
      { h: "Hébergement", p: ["Le site est hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis."] },
      { h: "Propriété", p: ["Les textes, photos et logos du site appartiennent à MyBigMarket ou sont utilisés avec l'accord de leurs auteurs. Toute reproduction sans accord est interdite."] },
    ],
  },
];

INFO_PAGES.push({
  slug: "contact", title: "Contact", metaTitle: "Contact | MyBigMarket Abidjan",
  description: "Contacter MyBigMarket à Abidjan : WhatsApp, téléphone et e-mail. Réponse du lundi au samedi, de 8 h à 19 h.",
  intro: "Le moyen le plus rapide de me joindre est WhatsApp.",
  sections: [
    { h: "WhatsApp et téléphone", p: [`${SHOP.phoneDisplay} (WhatsApp et appels). ${SHOP.hours}.`] },
    { h: "E-mail", p: [`${SHOP.email}. Je réponds sous un jour ouvré.`] },
    { h: "Où ?", p: [`${SHOP.city}. Boutique en ligne : les produits sont livrés, il n'y a pas de magasin ouvert au public.`] },
    { h: "Pour une commande déjà passée", p: ["Gardez votre numéro de commande à portée de main : il me permet de retrouver votre commande tout de suite."] },
  ],
});

export const findInfoPage = (slug: string) => INFO_PAGES.find((page) => page.slug === slug);
