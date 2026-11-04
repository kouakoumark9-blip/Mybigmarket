# Backend mybigmarket — Étape 4 : clients, panier, commandes, taxes, devises

Ce document décrit ce que l'étape 4 ajoute. Les fondations sont décrites dans [02-fondations.md](./02-fondations.md), le catalogue, les prix et le grand livre de stock dans [03-catalogue-prix-stocks.md](./03-catalogue-prix-stocks.md).

## 1. Mise à jour de la base de production

La migration `0016` s'applique comme les précédentes, en une seule commande, après une branche de sauvegarde dans Neon :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
```

Le fichier applique d'un coup toutes les migrations en retard (`0013` à `0016` aujourd'hui en production). Il peut être rejoué sans risque.

Ce que fait `0016` :

- `carts.voucher_codes` : les codes de réduction saisis dans le panier ;
- `orders.customer_id` : le profil client de la commande, rempli pour les commandes existantes à partir de l'acheteur ;
- `orders.checkout_group_id` : relie les commandes nées d'un même passage en caisse (une par vendeur) ;
- `orders.applied_vouchers` : les bons appliqués, figés au moment de la commande ;
- deux index (`orders_checkout_group_idx`, `orders_customer_idx`).

Aucune donnée n'est modifiée ou supprimée. Tant que `0016` n'est pas appliquée, le tunnel de commande du site garde exactement son comportement actuel.

## 2. Le calcul unique du panier (`server/modules/checkout/quote.ts`)

Le site, l'API de la boutique et le passage de commande utilisent le **même calcul**, refait à chaque lecture. Le prix envoyé par le navigateur n'est jamais utilisé.

Pour chaque ligne :

1. le produit et la déclinaison sont relus ;
2. le prix du client est calculé (groupe, prix spécifiques, règles catalogue, paliers, taxe du pays de livraison), comme décrit à l'étape 3 ;
3. la disponibilité est vérifiée : stock de la déclinaison, composant le plus rare pour un pack, vente en rupture si elle est autorisée.

Une ligne qui ne peut pas être commandée porte un motif :

| Motif | Signification |
|---|---|
| `not_found` | Produit supprimé ou introuvable |
| `unavailable` | Produit non visible en boutique |
| `insufficient_stock` | Quantité demandée supérieure au disponible |
| `below_minimum` | Quantité inférieure au minimum de commande du produit |
| `variant_required` | Le produit a des déclinaisons : il faut en choisir une |

Les **bons de réduction** s'appliquent sur les prix TTC, avec un motif explicite quand ils sont refusés (`login_required`, montant minimum, limite atteinte…). La remise est répartie au prorata des lignes éligibles, part de taxe comprise.

Les totaux sont **regroupés par vendeur**, puisque chaque vendeur reçoit sa propre commande. Les frais de livraison valent 0 dans le panier : ils sont confirmés plus tard, comme aujourd'hui.

## 3. Panier serveur

| Route (`/api/v1/shop`) | Rôle |
|---|---|
| `GET /cart?country=CI` | Panier recalculé |
| `POST /cart/items` | Ajouter un article (quantité cumulée) |
| `PATCH /cart/items` | Fixer la quantité (`0` retire l'article) |
| `PUT /cart/vouchers` | Remplacer la liste des codes de réduction (5 au maximum) |
| `DELETE /cart` | Vider le panier |

Fonctionnement :

- **Invité.** Le panier est lié à un cookie `mbm_cart` HttpOnly, SameSite=Lax, Secure en production, valable 30 jours. La base n'en garde que l'empreinte SHA-256.
- **Connexion.** À la connexion, le panier invité est fusionné dans celui du compte, puis le cookie est effacé.
- **Limites.** 100 lignes au maximum, 10 000 unités par ligne.

## 4. Passage de commande

`POST /api/v1/shop/checkout` exige d'être connecté et un en-tête `Idempotency-Key` : un double clic ou un renvoi réseau ne crée pas de seconde commande.

Corps de la requête :

```json
{
  "delivery": {
    "method": "delivery",
    "countryCode": "CI",
    "language": "fr",
    "addressId": "…",
    "address": null,
    "pickupPointId": null
  },
  "paymentMethod": "orange_money"
}
```

- `method` : `delivery` (adresse enregistrée via `addressId`, ou saisie via `address`) ou `pickup` (point relais, en Côte d'Ivoire uniquement).
- `paymentMethod` : `orange_money`, `mtn_momo`, `wave` ou `card`. Aucune donnée de carte ne transite ni n'est stockée : le paiement passe par le prestataire configuré.

Tout se fait dans **une seule transaction** :

1. le panier est recalculé ; la moindre ligne en défaut ou le moindre bon refusé annule tout (422, avec le détail) ;
2. chaque bon est consommé de façon atomique : s'il vient d'atteindre sa limite, la commande est refusée (409) ;
3. une commande est créée **par vendeur**, numérotée `CMD-AAAA-NNNNNN` sans trou, avec les lignes, la livraison et les bons figés ;
4. le stock est **réservé** jusqu'à l'expiration du paiement (réglage `orders.payment_expiry_minutes`, 60 minutes par défaut). Un pack réserve ses composants ; un produit virtuel ne réserve rien ;
5. le paiement est initié, l'historique de statut et le suivi client sont créés, l'événement `order.created` est émis ;
6. le panier est marqué « converti ».

Le tunnel actuel du site (`actions/checkout.ts`) passe par ce même service dès que la migration `0016` est appliquée, avec des messages d'erreur précis pour le client. Avant la migration, il garde son chemin historique.

## 5. Espace client

| Route (`/api/v1/shop`) | Rôle |
|---|---|
| `GET /account`, `PATCH /account` | Profil : nom, téléphone, société, numéro contribuable, langue, newsletter |
| `GET /account/export` | Export des données personnelles (droit d'accès et de portabilité) |
| `GET/POST /addresses`, `PATCH/DELETE /addresses/:id` | Carnet d'adresses |
| `GET /orders?page=1` | Mes commandes |
| `GET /orders/:id` | Détail (identifiant ou référence) : lignes, totaux, bons, historique, paiement |
| `GET /orders/:id/invoice` | Facture de la commande (HTML imprimable) |

Règles :

- **Newsletter.** Le consentement est horodaté et révocable ; la date du retrait est conservée.
- **Société.** Renseigner une société ou un numéro contribuable classe le client en segment `business`.
- **Adresses.** Elles sont validées (téléphone, ville, pays desservi), 20 au maximum. Une adresse en double est refusée (409). La première devient l'adresse par défaut, et il n'y a jamais qu'une adresse par défaut de livraison et une de facturation.
- **Cloisonnement.** Un client ne voit que ses propres commandes et factures.

## 6. API d'administration

Toutes les routes ci-dessous sont sous `/api/v1/admin`. Elles sont décrites en détail dans `GET /api/v1/openapi.json`.

### Commandes

| Action | Route | Permission |
|---|---|---|
| Liste et recherche (référence, e-mail ou nom de l'acheteur) | `GET /orders?q=…&filter[status]=…` | `orders.read` |
| Fiche complète | `GET /orders/:id` | `orders.read` |
| Changement de statut | `POST /orders/:id/status` | `orders.status.update` |
| Note interne | `PATCH /orders/:id/note` | `orders.update` |
| Émettre la facture | `POST /orders/:id/invoice` | `orders.documents.manage` |
| Émettre un avoir | `POST /orders/:id/credit-notes` | `orders.documents.manage` |
| Document d'une facture | `GET /invoices/:id/document` | `orders.read` |

La fiche renvoie l'acheteur, les lignes, les paiements, l'historique, les factures et avoirs, les réservations de stock, le séquestre et les **statuts suivants possibles**.

**Changement de statut.** Seules les transitions prévues par `lib/order-rules` sont acceptées ; les autres sont refusées (422) avec le statut de départ et d'arrivée. Un champ `version` facultatif protège contre deux modifications simultanées (409). Chaque changement produit dans la même transaction :

| Nouveau statut | Effets |
|---|---|
| Payée (`paid_escrow`) | Paiement réglé, réservation de stock confirmée (elle n'expire plus), séquestre bloqué avec la commission de la plateforme |
| Expédiée, livrée | Les unités réservées sortent du stock physique (mouvement `sale`) |
| Livrée | Séquestre éligible au paiement du vendeur |
| Annulée | Réservation libérée (ou stock restitué pour une commande antérieure aux réservations), paiement en attente annulé, séquestre à rembourser |
| Remboursée | Séquestre à rembourser ; le stock n'est libéré que si rien n'a été expédié |

Puis l'historique de statut, le suivi visible par le client, le journal d'audit et l'événement `order.status_changed`.

La commission vient du réglage `commission_bps` de la plateforme, sinon de `PLATFORM_COMMISSION_BPS` (800 = 8 %, plafonné à 20 %).

**Factures et avoirs.**

- Une facture `FAC-AAAA-NNNNNN` s'émet après paiement, sur une commande non annulée. Une commande n'a qu'une facture émise à la fois (409 sinon).
- Un avoir `AVR-AAAA-NNNNNN` se rattache à la facture émise. Le total des avoirs ne peut pas dépasser le montant de la facture.
- La numérotation est sans trou, par année.
- Le document est une page HTML A4 imprimable, servie avec une politique de sécurité qui interdit tout script ou ressource externe.

### Clients et groupes

| Action | Route | Permission |
|---|---|---|
| Liste et recherche (nom, e-mail, téléphone, société), avec nombre de commandes et montant dépensé | `GET /customers?q=…` | `customers.read` |
| Fiche : profil, groupes, adresses, 10 dernières commandes, totaux | `GET /customers/:id` | `customers.read` |
| Modification : groupe principal, groupes additionnels, segment, société, note interne | `PATCH /customers/:id` | `customers.update` |
| Anonymisation | `POST /customers/:id/anonymize` | `customers.manage` |
| Groupes | `GET/POST /customer-groups`, `PATCH/DELETE /customer-groups/:id` | `customers.read` / `customers.manage` |

Règles :

- **Anonymisation.** Elle est refusée tant qu'une commande est en cours. Elle efface l'identité du compte, du profil, des adresses et des adresses de livraison des commandes ; les montants restent pour la comptabilité. Elle est journalisée.
- **Groupe par défaut.** Il ne peut être ni supprimé ni privé de ce statut : on en désigne un autre. Supprimer un groupe fait basculer ses membres dans le groupe par défaut.
- La remise d'un groupe s'applique automatiquement dans le calcul des prix (étape 3).

### Taxes et devises

| Action | Route | Permission |
|---|---|---|
| Règles de taxe (taux par pays et région) | `GET/POST /tax-rules`, `PATCH /tax-rules/:id` | `localization.*` |
| Groupes de taxes (affectés aux produits) | `GET /tax-rule-groups`, `POST /tax-rule-groups`, `PATCH/DELETE /tax-rule-groups/:id` | `catalog.products.read` pour la lecture, `localization.*` pour l'écriture |
| Devises | `GET/POST /currencies`, `PUT /currencies/:id` | `localization.*` |

Côté boutique, `GET /api/v1/shop/currencies` liste les devises actives : symbole, décimales, position du symbole, taux de conversion. Les devises servent à l'affichage : les montants, la comptabilité et les paiements restent en FCFA (XOF).

## 7. Tests

`tests/server/checkout-api.test.ts` exerce tout le parcours sur une vraie base PostgreSQL en mémoire (PGlite) :

- panier invité, fusion à la connexion, bon refusé puis accepté ;
- commande idempotente répartie sur deux vendeurs, stock réservé, bon consommé, événement émis ;
- limite par client et stock insuffisant ;
- espace client : compte, adresses, export ;
- tunnel du site passant par le calcul unique ;
- statuts d'administration et leurs effets, annulation qui libère la réservation ;
- facture, avoir, document HTML, accès réservé à l'acheteur ;
- clients, groupes, anonymisation refusée ;
- taxes et devises.

## 8. Points laissés pour une étape suivante

- Les frais de livraison sont confirmés après la commande, comme aujourd'hui ; leur calcul dans le panier viendra avec l'étape livraison et paiement.
- Les demandes de retour (RMA) côté client ne sont pas encore exposées dans l'API de la boutique.
- Les écrans du back-office pour les commandes, les clients, les taxes et les devises s'appuieront sur ces routes.
