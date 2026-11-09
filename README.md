# MyBigMarket

Boutique en ligne d'Abidjan (Côte d'Ivoire) : climatiseurs, groupes électrogènes, informatique, électroménager, téléviseurs.
Une seule vendeuse, ses propres produits, prix en FCFA, **paiement à la livraison**.

Technique : Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (Neon) avec Drizzle, hébergement Vercel.

## Où modifier quoi

| Je veux… | Je modifie… |
|---|---|
| Ajouter, modifier, supprimer un produit, voir les commandes | l'administration, adresse **/gestion** (voir plus bas) |
| Remplacer mon numéro WhatsApp, mes horaires, mon e-mail | `lib/shop/config.ts` |
| Changer les frais de livraison par commune | `lib/shop/delivery.ts` (le montant en FCFA de chaque ligne) |
| Installer les bannières de l'accueil | `public/bannieres/` + `lib/shop/banners.ts` (lisez `public/bannieres/LISEZ-MOI.txt`) |
| Changer le texte des pages À propos, Livraison, Retours, Conditions… | `lib/shop/pages.ts` |
| Compléter les mentions légales (nom, adresse) | `LEGAL` dans `lib/shop/pages.ts` |
| Changer le texte d'une catégorie (introduction, conseils, questions, titre Google) | l'administration, menu **Catégories** |
| Changer les couleurs | `app/theme.css` (orange `#F68B1E` (style Jumia), noir) |

## Remplacer les 6 produits fictifs

Les 6 fiches « fiche fictive » servent seulement à voir le site rempli. Elles sont visibles mais **ne peuvent pas être commandées**.

1. Ouvrez `/gestion` et connectez-vous.
2. Menu **Produits**, filtre **Fiches fictives**.
3. Ouvrez une fiche, remplacez le nom, le prix, la description, les photos, le stock, la disponibilité.
4. Décochez **Fiche fictive** en bas, puis **Enregistrer**. Le produit est alors en vente.
5. Ou supprimez la fiche (bouton en bas de la fiche) et ajoutez vos produits avec **Ajouter un produit** ou **Import CSV**.

Chaque produit a une disponibilité : **En stock à Abidjan** (livraison 24 à 72 h) ou **Sur commande** (livraison sous X jours, vous choisissez X). Ce texte s'affiche sur les cartes, la fiche, le panier et la commande : ne mettez que des délais que vous pouvez tenir.

Les champs rouges **internes** (lien Alibaba, prix d'achat, frais d'importation, marge) ne sont jamais visibles par les clients.

## Administration (/gestion)

- Une seule administration, dans ce projet, derrière identifiant et mot de passe. Session de 8 h, verrouillage après 5 erreurs, double authentification possible.
- L'adresse n'est ni dans le menu, ni dans le sitemap, ni dans robots.txt ; elle envoie `noindex` aux moteurs de recherche.
- Le compte est un « employé » de la base. Pour le créer la première fois : `SEED_SUPERADMIN_EMAIL=… SEED_SUPERADMIN_PASSWORD=… npm run db:seed:admin` (mot de passe de 16 caractères minimum).
- Fonctions : produits (ajout, modification, suppression, photos, caractéristiques, ancien prix, disponibilité, classe énergétique), commandes (nouvelle, confirmée, en livraison, livrée, annulée, note interne, WhatsApp client), catégories (textes et référencement), import CSV (modèle téléchargeable dans l'écran **Import CSV**).
- Pas de récupération automatique des photos ni des textes d'Alibaba : vous utilisez vos propres photos et textes.

## Commander (côté client)

Panier, puis une seule page (nom, téléphone, commune, adresse précise), sans compte. Le serveur recalcule prix, stock et frais de livraison. À la fin : numéro de commande (`MBM-AAMMJJ-XXXX`) et message WhatsApp déjà rempli. Suivi de commande sur `/suivi-commande` (numéro + téléphone).

Les moyens Orange Money, MTN Mobile Money, Moov Money et Wave ont leur emplacement (« bientôt ») dans `lib/shop/config.ts` (`PAYMENT_METHODS`).

## Publier une mise à jour sur Vercel

1. Envoyez vos modifications sur GitHub (branche `main`) : Vercel construit et publie automatiquement.
2. Les modifications faites dans `/gestion` (produits, commandes, textes) sont en ligne tout de suite, sans republication.
3. Variables d'environnement (Vercel › Settings › Environment Variables) : voir `.env.example`. Indispensables : `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `BLOB_READ_WRITE_TOKEN` (photos des produits).
4. Après une mise à jour de la base : `npx drizzle-kit migrate`, puis (une seule fois) `npm run db:seed:boutique` pour créer les catégories et les 6 fiches fictives.

## Adresses du site

`/` accueil · `/climatiseurs`, `/climatiseurs/inverter`, `/informatique/reseau-wifi`… catégories · `/produits/nom-du-produit` fiche produit (page produit inchangée) · `/promotions` · `/panier` · `/commande` · `/suivi-commande` · `/a-propos`, `/comment-commander`, `/livraison`, `/retours-et-remboursements`, `/conditions-de-vente`, `/confidentialite`, `/mentions-legales`, `/contact`.

## Développer en local

```bash
npm install
cp .env.example .env.local        # puis renseignez DATABASE_URL
npx drizzle-kit migrate
npm run db:seed:boutique          # catégories et 6 fiches fictives
npm run dev                       # http://localhost:3000
```

## Vérifications

```bash
npm run lint && npx tsc --noEmit && npm test    # tests unitaires et d'intégration
npm run build && npm run test:e2e               # navigateur (PostgreSQL requis)
```

## Structure

```
app/(boutique)/   pages publiques (accueil, catégories, panier, commande, pages d'information)
app/gestion/      administration
components/shop/  en-tête, pied de page, cartes produit, carrousel, panier, commande
components/product-detail/  fiche produit (ne pas modifier)
lib/shop/         réglages, livraison, disponibilité, requêtes du catalogue, commandes
lib/gestion/      connexion, produits, import CSV de l'administration
server/, lib/db/  API v1, base de données (Drizzle), paiement
```

La documentation technique de l'API est dans `docs/backend/`.
