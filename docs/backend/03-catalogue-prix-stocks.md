# Backend mybigmarket — Étape 3 : catalogue, prix, stocks

Ce document décrit ce que l'étape 3 ajoute et comment s'en servir. Les fondations (authentification, permissions, listes, erreurs, audit, événements) sont décrites dans [02-fondations.md](./02-fondations.md).

## 1. Mise à jour de la base de production

La migration `0015` s'applique comme les précédentes, en une seule commande :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
```

Faites d'abord une branche de sauvegarde dans Neon. Le fichier applique d'un coup `0013`, `0014` et `0015` si la base est en retard. Après application, `/api/health` doit répondre `200`.

Ce que fait `0015` :

- elle ajoute des tables : entrepôts, niveaux de stock, réservations, prix spécifiques, règles de prix catalogue, utilisations des bons, images de déclinaison et fichiers des produits virtuels ;
- elle ajoute des colonnes facultatives aux bons (`promo_codes`), aux mouvements de stock, aux catégories et aux produits ;
- elle crée l'**entrepôt par défaut**, `principal` à Abidjan (identifiant `00000000-0000-4000-8000-000000000002`) ;
- elle reprend le stock existant comme stock physique de cet entrepôt.

Aucune quantité n'est modifiée : `products.quantity` et `product_variants.stock` restent identiques, ce que vérifie `tests/migrations-apply.test.ts`.

Tant que `0015` n'est pas appliquée, la boutique garde exactement son comportement actuel : le grand livre de stock bascule en mode historique.

## 2. Le grand livre de stock (`lib/stock-ledger.ts`)

Toute variation de stock passe par ce module, dans la transaction de l'opération. Il est partagé par la boutique, l'API et le back-office ; une copie identique vit dans `adminnew/lib/stock-ledger.ts`, et un test vérifie que les deux restent identiques.

| Notion | Définition |
|---|---|
| Stock physique | Unités présentes dans un entrepôt |
| Stock réservé | Unités bloquées par des commandes pas encore expédiées |
| Disponible | Physique − réservé |
| Compteur boutique (`products.quantity`, `product_variants.stock`) | Disponible total des entrepôts **actifs et vendables**, tenu à jour dans la même transaction |
| Mouvement (`stock_movements`) | Chaque variation du stock physique : quantités avant/après, motif, entrepôt, auteur, commande, référence |

Le cycle d'une commande :

| Moment | Effet sur le stock |
|---|---|
| Création (tunnel de la boutique) | Les unités sont **réservées**. La réservation expire avec le délai de paiement |
| Paiement confirmé (webhook ou back-office) | La réservation n'expire plus |
| Expédition, ou livraison si l'expédition n'a pas été saisie | Les unités réservées sortent du stock physique (mouvement `sale`) |
| Annulation, expiration ou paiement refusé | La réservation est libérée |

Une commande passée avant ce changement n'a pas de réservation. Si elle est annulée, son stock est restitué comme le faisait l'ancien code.

Garanties :

- **Pas de survente.** Une réservation ou une sortie qui rendrait le disponible négatif est refusée (vente en rupture autorisée seulement si elle est demandée).
- **Pas d'interblocage.** La ligne produit est toujours verrouillée en premier.
- **Réconciliation automatique.** Si un ancien écran a modifié le compteur sans passer par le grand livre (un vendeur qui crée un produit, par exemple), l'écart est reporté sur l'entrepôt par défaut avec un mouvement `inventory` tracé.
- **Alerte de stock bas.** L'événement `stock.low` est émis quand le compteur passe sous le seuil d'alerte.
- **Événement par mouvement.** `stock.movement` est émis à chaque mouvement, et peut être transmis par le module « Webhooks sortants ».

**Correction d'un bug existant.** Passer une commande à « payée » depuis le back-office décomptait le stock une seconde fois, alors qu'il l'était déjà à la création de la commande. Ce n'est plus le cas.

## 3. API d'administration

Toutes les routes ci-dessous sont sous `/api/v1/admin`. Elles sont décrites en détail dans `GET /api/v1/openapi.json`.

### Taxonomie

| Ressource | Routes |
|---|---|
| Catégories | `GET /categories` (liste filtrable), `GET /categories/tree`, `POST`, `GET/PATCH/DELETE /categories/:id`, `POST /categories/:id/move` |
| Marques | `GET/POST /brands`, `GET/PATCH/DELETE /brands/:id` |
| Fournisseurs | `GET/POST /suppliers`, `GET/PATCH/DELETE /suppliers/:id` |
| Attributs | `GET/POST /attribute-groups`, `GET/PATCH/DELETE /attribute-groups/:id`, `POST/PATCH/DELETE /attribute-groups/:id/values[/:valueId]` |
| Caractéristiques | `GET/POST /features`, `GET/PATCH/DELETE /features/:id`, `POST/PATCH/DELETE /features/:id/values[/:valueId]` |

Règles :

- L'arbre des catégories est de profondeur illimitée.
- Un déplacement qui créerait un cycle est refusé (422).
- Supprimer une catégorie fait remonter ses sous-catégories d'un niveau. Ses produits passent dans la catégorie parente, ou dans `?moveProductsTo=ID` : aucun produit ne reste orphelin.
- Une valeur d'attribut ou de caractéristique encore utilisée ne peut pas être supprimée ; elle peut être désactivée.

### Produits

| Action | Route |
|---|---|
| Liste et recherche | `GET /products?q=…&filter[status]=approved&filter[categoryId]=…&sort=-updatedAt` |
| Corbeille | `GET /products/trash`, `POST /products/:id/restore` |
| Création | `POST /products` (simple, `pack` ou `virtual`) |
| Fiche complète | `GET /products/:id` |
| Modification | `PATCH /products/:id` (`version` facultatif pour le verrou optimiste) |
| Corbeille / duplication | `DELETE /products/:id`, `POST /products/:id/duplicate` |
| Actions groupées | `POST /products/bulk` : `publish`, `unpublish`, `archive`, `delete`, `feature`, `unfeature`, `set_category` |
| Images | `GET/POST /products/:id/images`, `PUT /products/:id/images/order`, `PATCH/DELETE /products/:id/images/:imageId` |
| Déclinaisons | `GET /products/:id/combinations`, `POST /products/:id/combinations/generate`, `PATCH/DELETE /products/:id/combinations/:variantId` |
| Caractéristiques, pièces jointes | `PUT /products/:id/features`, `POST/DELETE /products/:id/attachments[/:attachmentId]` |
| Pack, fournisseurs | `PUT /products/:id/pack`, `PUT /products/:id/suppliers` |
| Produit virtuel, personnalisation | `PUT/DELETE /products/:id/download`, `PUT /products/:id/customizations` |

Règles :

- **Prix.** Ils sont saisis HT, en FCFA entiers.
- **Publication.** Passer un produit en `approved` ou `published` exige la permission `catalog.products.publish`.
- **Slug.** Changer le slug crée une redirection 301 de l'ancienne URL. La fiche produit de la boutique (`/produits/…`) suit déjà ces redirections. Un produit désactivé peut aussi rediriger (`redirectType`, `redirectTargetType`, `redirectTarget`).
- **Stock.** Il ne se modifie pas par `PATCH`. Seul `initialQuantity` à la création est accepté, et il est tracé comme un mouvement.
- **Déclinaisons.** Elles sont générées par produit cartésien des valeurs choisies, groupe par groupe, avec 500 combinaisons au maximum. Régénérer ne crée pas de doublon. Une seule déclinaison est la déclinaison par défaut.
- **Packs.** Un pack ne peut contenir ni lui-même ni un autre pack. Son disponible est celui de son composant le plus rare.
- **Produits virtuels.** Ils portent une clé de stockage privée, jamais une URL publique.
- **Duplication.** Elle produit un brouillon, sans stock, sans référence, sans SKU ni code-barres.

### Prix et promotions

| Action | Route |
|---|---|
| Simulation du prix d'un client | `GET /products/:id/price?quantity=10&customerId=…&country=CI` |
| Prix dégressifs | `PUT /products/:id/price-tiers` |
| Prix spécifiques | `GET/POST /products/:id/specific-prices`, `PATCH/DELETE /specific-prices/:id` |
| Règles de prix catalogue | `GET/POST /catalog-price-rules`, `GET/PATCH/DELETE /catalog-price-rules/:id` |
| Bons de réduction | `GET/POST /vouchers`, `GET/PATCH/DELETE /vouchers/:id`, `POST /vouchers/simulate` |

Ordre de calcul (fonctions pures de `lib/pricing.ts`, testées) :

1. **Palier dégressif.** Il remplace le prix de base ; il ne se cumule pas.
2. **Remise du groupe** du client.
3. **Meilleure règle applicable** entre les prix spécifiques du produit et les règles de prix catalogue. C'est la plus favorable au client qui l'emporte. Une règle peut être :
   - un prix fixe HT, ou une remise en pourcentage ou en montant ;
   - ciblée par déclinaison, client, groupe, pays, devise, quantité minimale et période.
4. **Plancher.** Le prix ne descend jamais sous le prix d'achat.
5. **Écotaxe**, puis **taxe du pays** de livraison (groupe de taxes du produit).

Le **prix barré** est le prix normal (prix catalogue + écotaxe) quand le prix payé lui est inférieur.

Les **bons de réduction** (`lib/vouchers.ts`) s'appliquent aux prix **TTC** réellement payés. Ils gèrent :

- une période de validité ;
- une limite globale et une limite par client ;
- un client ou un groupe réservé ;
- un montant minimum ;
- une restriction à certains produits ou catégories, et l'exclusion des produits déjà remisés ;
- un plafond de remise ;
- la livraison offerte ;
- le cumul ou non avec d'autres bons. Un bon non cumulable ne s'additionne à aucun autre ; la combinaison la plus avantageuse est retenue.

Un code est généré si aucun n'est fourni.

### Stocks

| Action | Route |
|---|---|
| Entrepôts | `GET/POST /warehouses`, `GET/PATCH/DELETE /warehouses/:id` |
| Niveaux | `GET /stock?lowStock=true&filter[warehouseId]=…`, `GET /products/:id/stock` |
| Mouvements | `GET /stock/movements?filter[productId]=…&filter[reason]=sale` |
| Entrée / sortie | `POST /stock/adjustments` (`purchase`, `return`, `adjustment`, `loss`, `restock`) |
| Inventaire | `POST /stock/inventory` (quantités comptées) |
| Transfert | `POST /stock/transfers` |
| Réception fournisseur | `POST /stock/receipts` (met aussi à jour le coût d'achat chez ce fournisseur) |
| Réservations | `GET /stock/reservations`, `POST /stock/reservations/:id/release` |
| Alertes | `GET /stock/alerts` |
| Réapprovisionnement | `GET /stock/replenishment?days=30` |
| Intégrité | `GET /stock/drifts`, `POST /stock/reconcile` |
| Export CSV | `GET /stock/export.csv` |
| Import CSV | `POST /stock/import` |

Entrepôts :

- Un entrepôt de transit (en Chine, par exemple) se déclare avec `isSellable: false` : son stock est suivi mais n'est pas vendu en boutique.
- Activer un entrepôt, le désactiver ou changer son caractère « vendable » recale les compteurs de la boutique.
- L'entrepôt par défaut reste actif et vendable.
- Un entrepôt ne se supprime que vide.

Réapprovisionnement : la suggestion couvre le délai d'approvisionnement du produit plus 7 jours de sécurité, d'après les ventes de la période, sans descendre sous le seuil d'alerte + 1. Les suggestions sont regroupées par fournisseur, avec un coût estimé.

Export CSV : séparateur `;`, UTF-8 avec BOM, lisible directement dans Excel. Les cellules qui commencent par `=`, `+`, `-` ou `@` sont neutralisées contre l'injection de formules.

Import CSV : on envoie `{ "csv": "…", "mode": "set" | "add", "dryRun": true }`.

- **Colonnes.** `reference`, `sku` ou `ean13` (au moins une), `sku_declinaison` (facultative), `quantite`, `entrepot` (code, facultatif).
- **Simulation par défaut.** Elle exécute réellement l'import puis l'annule : le rapport ligne par ligne est donc exact.
- **Tout ou rien.** Hors simulation, la moindre ligne en erreur annule tout l'import.

## 4. API publique de la boutique

Toutes les routes ci-dessous sont sous `/api/v1/shop`.

| Route | Contenu |
|---|---|
| `GET /categories` | Arbre des catégories actives. Une catégorie inactive masque toute sa branche. Nombre de produits visibles |
| `GET /categories/:slug` | Fil d'Ariane, sous-catégories, SEO |
| `GET /brands` | Marques actives |
| `GET /products` | Filtres : `q`, `category` (sous-catégories incluses), `brand`, `minPrice`, `maxPrice`, `inStock`, `featured`. Tri : `relevance`, `newest`, `price_asc`, `price_desc`, `name`. Pagination |
| `GET /products/:slug` | Fiche : prix du client et de chaque déclinaison, disponibilité, caractéristiques, produits associés et accessoires, SEO. Une ancienne URL répond **301** vers la nouvelle |
| `POST /vouchers/check` | Vérification de bons sur un panier, avec motif de refus explicite. N'enregistre aucune utilisation |

**Visibilité.** Un produit est visible en boutique si toutes ces conditions sont réunies :

- il n'est pas supprimé ;
- son statut est `approved` ou `published` ;
- sa visibilité n'est pas `nowhere` ;
- son vendeur est actif et vérifié, comme sur les pages actuelles de la boutique.

**Prix.** Les prix affichés sont calculés pour le client connecté : groupe et prix spécifiques. Les listes de produits sont calculées en une seule passe, avec un nombre fixe de requêtes.

**Disponibilité.** Elle prend l'une de ces valeurs : `in_stock`, `low_stock` (le nombre exact n'est indiqué qu'à ce moment-là), `out_of_stock`, `backorder` (vente en rupture autorisée) ou `unavailable`.

## 5. Permissions utilisées

| Permission | Accès |
|---|---|
| `catalog.products.*` | Produits (`publish` pour publier) |
| `catalog.categories.*`, `catalog.brands.*`, `catalog.suppliers.*`, `catalog.attributes.*`, `catalog.features.*` | Taxonomie |
| `catalog.trash.manage` | Corbeille des produits |
| `pricing.*` | Prix spécifiques, règles catalogue, paliers, bons |
| `catalog.stock.read`, `catalog.stock.update` | Consultation et opérations de stock |
| `catalog.stock.manage` | Entrepôts et réconciliation |
| `catalog.import`, `catalog.export` | Import et export CSV |

## 6. Tests

| Fichier | Couverture |
|---|---|
| `tests/server/catalog-api.test.ts` | 28 tests d'intégration (PGlite) à travers le pipeline HTTP : taxonomie, produits, déclinaisons, packs, prix, bons, stocks, CSV, boutique, OpenAPI |
| `tests/stock-ledger.test.ts` | 7 tests du grand livre sur PostgreSQL réel, dont le mode historique avant migration |
| `tests/vouchers.test.ts` | 6 tests des règles de bons |
| `tests/pricing.test.ts` | Prix fixe spécifique ajouté (22 tests au total) |
| `tests/migrations-apply.test.ts` | Reprise du stock par `0015` sans modifier les compteurs |
| `tests/stock-ledger-sync.test.ts` | La copie du back-office reste identique |

## 7. Ce qui reste pour les étapes suivantes

- **Étape 4.** Brancher le panier et le tunnel sur le calcul de prix unique (prix spécifiques, bons, taxes), réserver par déclinaison, décompter les composants d'un pack et enregistrer l'utilisation des bons à la commande.
- **Étape 6.** Recherche plein texte tolérante aux accents (`tsvector`, `unaccent`) et facettes.
- **Étape 7.** Import CSV complet du catalogue (produits, prix), au même format de rapport.

**Statut « published ».** Le back-office utilise aussi ce statut. L'API le traite comme public, mais les pages actuelles de la boutique n'affichent que `approved` : les deux seront alignés à l'étape 4.
