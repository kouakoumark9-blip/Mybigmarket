# Backend mybigmarket — Étape 5 : livraison et paiement

Ce document décrit ce que l'étape 5 ajoute. Les étapes précédentes sont décrites dans [02-fondations.md](./02-fondations.md), [03-catalogue-prix-stocks.md](./03-catalogue-prix-stocks.md) et [04-clients-panier-commandes.md](./04-clients-panier-commandes.md).

## 1. Mise à jour de la base de production

La migration `0017` s'applique comme les précédentes, après une branche de sauvegarde dans Neon :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
```

Elle est additive et ne modifie aucune donnée existante :

- `payment_intents` : intentions de paiement ;
- `payment_transactions` : journal des transactions ;
- `payment_webhook_events` : boîte de réception des notifications ;
- `payments` : rattachement à l'intention, date de paiement, montant remboursé, motif d'échec ;
- `orders` : transporteur choisi et lien de suivi ;
- `shipments` : mode, transporteur, numéro et lien de suivi, arrivée prévue, note ;
- deux moyens de paiement, **Moov Money** et **paiement à la livraison**, livrés **désactivés**.

## 2. Paiement

### Principe

Un client règle en **un seul paiement** toutes les commandes d'un même passage en caisse (une commande par vendeur). Ce paiement est une **intention de paiement** : sa référence `PAY-AAAAMMJJ-XXXXXXXX` est l'identifiant de transaction transmis au prestataire.

1. **Création.** L'intention est créée dans la transaction de la commande, sans aucun appel réseau.
2. **Initialisation.** Après validation de la commande, l'intention est initialisée chez le prestataire, qui renvoie soit une page de paiement hébergée, soit des consignes (virement). Si cette étape échoue, la commande reste payable.
3. **Règlement.** L'intention est réglée par l'une de ces sources :
   - une notification signée du prestataire ;
   - une vérification auprès du prestataire ;
   - une confirmation de l'équipe (virement, paiement à la livraison).

   Toutes passent par la même fonction, donc les effets sont identiques : commande « paiement confirmée », réservation de stock confirmée, séquestre bloqué avec la commission.
4. **Refus.** Les commandes restent payables jusqu'à leur délai, et le client peut réessayer avec un autre moyen (`POST /shop/orders/:id/pay`). Passé le délai, la tâche planifiée annule la commande et libère le stock.

**Aucune donnée de carte ne transite ni ne se stocke chez nous** : la carte se saisit sur la page hébergée du prestataire. Les clés d'API ne vivent que dans les variables d'environnement.

### Prestataires

| Prestataire | Moyens | Fonctionnement |
|---|---|---|
| `cinetpay` | Orange Money, MTN MoMo, Moov Money, Wave, carte | Page hébergée. La notification est vérifiée (jeton HMAC `x-token`), puis l'état est confirmé par l'API de vérification. Le remboursement se fait depuis l'espace marchand puis se confirme dans l'API |
| `manual` | Virement, paiement à la livraison | Consignes au client, confirmation par l'équipe |
| `mock` | Mobile money et carte, simulés | Développement et tests. Notifications signées par `MOCK_WEBHOOK_SECRET`. **Refusé en production**, sauf `ALLOW_MOCK_PAYMENTS=true` |

Choix du prestataire :

- mobile money et carte passent par CinetPay dès que `CINETPAY_API_KEY` et `CINETPAY_SITE_ID` sont renseignés ;
- sans ces clés, ils passent par le paiement simulé hors production ;
- en production sans ces clés, ils **ne sont pas proposés**.

**À faire avant d'activer CinetPay :**

1. Valider le compte marchand.
2. Faire des essais en mode test.
3. Déclarer l'adresse de notification `https://<domaine>/api/webhooks/payments/cinetpay`.

### Moyens proposés au client

Un moyen est proposé si toutes ces conditions sont réunies :

- il est actif (`PATCH /admin/payment-methods/:code`) ;
- son prestataire est configuré ;
- pour le virement : les coordonnées bancaires sont saisies (réglages `payments.bank_transfer.*`) ;
- pour le paiement à la livraison : le pays fait partie de la liste et le montant ne dépasse pas le plafond (300 000 FCFA par défaut) ;
- si le moyen a des **règles par pays**, le pays est autorisé et le montant est compris entre le minimum et le maximum ;
- aucune règle de **groupe de clients** ne l'exclut.

Délai de paiement selon le moyen :

| Moyen | Délai |
|---|---|
| Prestataire (mobile money, carte) | `orders.payment_expiry_minutes` (60 min) |
| Virement | `payments.bank_transfer.expiry_hours` (72 h) |
| Paiement à la livraison | Aucun |

Le délai d'une nouvelle tentative n'est jamais raccourci.

### Paiement à la livraison

La commande est préparée et expédiée **avant** d'être payée :

1. Elle peut passer d'« en attente de paiement » à « confirmée par le vendeur ». Cette transition est réservée au paiement à la livraison et le moteur de commandes la refuse pour les autres moyens.
2. Le livreur encaisse.
3. L'équipe confirme l'encaissement (`POST /admin/payments/:id/confirm`).
4. Le séquestre est alors créé, éligible si la commande est déjà livrée.

Le vendeur n'est réglé qu'une fois le paiement du client encaissé, quel que soit le moyen.

### Notifications (webhooks)

Adresse : `POST /api/webhooks/payments/{prestataire}`.

| Cas | Réponse |
|---|---|
| Signature invalide | **401**. La notification est tracée sans son contenu et n'a aucun effet |
| Notification déjà reçue (même clé d'événement) | **200** avec le résultat initial ; **aucun retraitement** |
| Deux notifications distinctes pour un paiement déjà confirmé | Résultat `already_paid`, aucun effet |
| Montant ou devise différents de l'attendu | **409**. Le paiement reste en attente et l'événement `payment.amount_mismatch` est émis |
| Prestataire injoignable pendant la vérification | **503**. Le prestataire réessaie ; la notification en échec sera retraitée |
| Paiement reçu après l'annulation de la commande | La commande n'est pas relancée : séquestre « à rembourser » et événement `payment.refund_required` |
| Paiement reçu en double pour une commande déjà réglée | Pas de nouvel effet sur la commande : événement `payment.refund_required` |

Quand une commande est réglée, les autres paiements en attente qui la couvrent sont annulés.

L'ancienne adresse `/api/webhooks/payment` reste en service pour les paiements créés avant l'étape 5 (paiement simulé). Elle renvoie 409 pour les paiements de l'étape 5.

### Journal des transactions

`payment_transactions` reçoit chaque échange et chaque décision : création, initialisation, notification, vérification, confirmation manuelle, annulation, expiration, remboursement. Le journal est en ajout seul et expurgé : clés, signatures, numéros de carte et téléphones (seuls les 4 derniers chiffres sont gardés).

### Tâche planifiée `/api/cron/expire-orders`

Elle tourne une fois par jour et est protégée par `CRON_SECRET` :

1. Elle vérifie auprès des prestataires les paiements en attente depuis plus de 10 minutes, pour rattraper les notifications perdues.
2. Pour les commandes échues, elle **vérifie d'abord** auprès du prestataire : un paiement abouti n'est jamais annulé.
3. Elle annule les commandes toujours impayées, libère leur stock et clôt leurs intentions.

### Remboursements

`POST /admin/orders/:id/refunds` (permission `orders.refund`) :

- le montant ne dépasse jamais l'encaissé, remboursements en cours compris ;
- un avoir `AVR` est émis si la commande est facturée ;
- le remboursement est transmis au prestataire s'il sait rembourser par API. Sinon il reste « en cours » jusqu'à `POST /admin/refunds/:id/complete` (ou `/fail`) ;
- une fois effectué :
  - le montant remboursé du paiement est mis à jour, et le paiement passe « remboursé » quand il l'est en totalité ;
  - le séquestre est réduit, ou passe « remboursé » ;
- `closeOrder: true` passe la commande à « remboursée » quand tout est remboursé.

### API

| Route | Rôle | Permission |
|---|---|---|
| `GET /api/v1/shop/payment-methods?country=CI` | Moyens proposés (montant du panier par défaut) | — |
| `GET /api/v1/shop/payments/:reference` | État d'un paiement, vérifié auprès du prestataire au retour du client | client |
| `POST /api/v1/shop/orders/:id/pay` | Nouvelle tentative (en-tête `Idempotency-Key`) | client |
| `GET /api/v1/admin/payments`, `GET …/:id` | Paiements, détail avec commandes, journal et notifications | `payments.read` |
| `POST …/payments/:id/confirm` | Confirmer un virement ou un encaissement à la livraison | `payments.update` |
| `POST …/payments/:id/reconcile`, `POST …/payments/reconcile` | Vérifier un paiement, ou les paiements en attente | `payments.update` |
| `POST …/payments/:id/cancel` | Annuler un paiement en attente | `payments.update` |
| `GET …/payment-notifications` | Notifications reçues (filtre `status`, `signatureValid`) | `payments.read` |
| `GET …/payment-methods`, `PATCH …/:code`, `PUT …/:code/countries` | Moyens de paiement et règles par pays | `payments.read` / `payments.manage` |
| `GET …/refunds`, `POST …/orders/:id/refunds`, `POST …/refunds/:id/complete`, `POST …/refunds/:id/fail` | Remboursements | `payments.read` / `orders.refund` |

## 3. Livraison

### Devis

Le calcul tarifaire reste dans `lib/shipping-quote.ts`, avec ses fonctions pures testées. Le nouveau module `server/modules/shipping` lit la base et applique les décisions.

**Correction.** La grille d'un transporteur est maintenant lue pour la seule zone de livraison résolue. Les tranches de plusieurs zones étaient mélangées. La route publique `/api/transport/devis` passe par le même service et garde sa réponse.

Une grille d'exemple (`sampleRatesOnly` ou tranche `sampleOnly`) apparaît avec `billable: false` et n'est **jamais facturée**.

### Transport au passage de commande

`delivery.shippingMethodCode` dans `POST /api/v1/shop/checkout` :

- **Transporteur choisi.** Il doit être facturable pour chaque commande (vendeur), sinon 422 `shipping_method_unavailable`. Le transport est facturé par commande et compte dans le montant à payer.
- **Sans choix.** Si un transporteur facturable existe et que le réglage `shipping.require_billable_method` est actif (par défaut), la commande est refusée (422 `shipping_method_required`, avec la liste des transporteurs). Sinon le transport est « à confirmer » à 0 FCFA, comme avant l'étape 5.
- **Bon « livraison offerte ».** Le transport est ramené à 0 FCFA.

**En production aujourd'hui**, les deux transporteurs (avion et bateau) sont inactifs et à tarifs d'exemple. Le transport reste donc « à confirmer » tant que l'équipe n'a pas saisi de grille réelle.

### Lots de groupage (Chine → Afrique)

Un lot regroupe des commandes expédiées ensemble. Les statuts possibles :

| Statut | Signification |
|---|---|
| `draft` | Brouillon |
| `collecting` | En constitution |
| `shipped` | Parti de Chine |
| `arrived_abidjan` | Arrivé à Abidjan |
| `closed` | Clôturé |
| `cancelled` | Annulé (avant le départ) |

Règles :

- **Entrée dans un lot.** Seules les commandes confirmées par le vendeur entrent dans un lot ; elles passent « reçue au point de collecte ». Une commande n'appartient qu'à un lot ouvert.
- **Départ.** Les commandes passent « expédiée » avec le numéro de suivi du lot, et le stock réservé sort du stock physique.
- **Arrivée.** Les commandes passent « arrivée à Abidjan ».
- **Événement.** `shipment.status_changed` est émis à chaque changement.

### Suivi

- **Client** : `GET /api/v1/shop/orders/:id/tracking`. Il donne les étapes datées, le transporteur, le numéro et le lien de suivi, le lot et l'arrivée prévue.
- **Lien de suivi.** S'il n'est pas saisi, il est construit à partir du motif du transporteur (`trackingUrlPattern` contenant `{tracking}`, en `https://`).
- **Sans compte** : `POST /api/v1/shop/tracking` avec la référence et l'e-mail de l'acheteur.
  - La réponse est identique si l'un des deux est faux.
  - Aucune adresse n'est exposée.
  - Le nombre d'essais est limité.
  - Le suivi sans compte se désactive avec le réglage `shipping.tracking_lookup_enabled`.

### API

| Route | Rôle | Permission |
|---|---|---|
| `POST /api/v1/shop/shipping/quote` | Devis du panier : options par commande et transporteurs facturables communs | — |
| `GET /api/v1/shop/pickup-points?city=` | Points relais actifs | — |
| `GET /api/v1/shop/orders/:id/tracking`, `POST /api/v1/shop/tracking` | Suivi client, suivi sans compte | client / — |
| `GET/POST /api/v1/admin/shipping/methods`, `GET/PATCH/DELETE …/:id`, `PUT …/:id/rates` | Transporteurs et grilles par zone (sans trou ni chevauchement) | `shipping.*` |
| `GET/POST …/shipping/zones`, `PATCH/DELETE …/:id` | Zones (pays, régions, villes ; une zone par défaut) | `shipping.*` |
| `POST …/shipping/quote` | Simulateur | `shipping.read` |
| `GET/POST …/pickup-points`, `PATCH/DELETE …/:id` | Points relais. S'il a déjà servi, un point est désactivé plutôt que supprimé | `shipping.*` |
| `PUT …/orders/:id/shipping`, `GET …/orders/:id/tracking` | Transporteur et suivi d'une commande | `orders.update` / `orders.read` |
| `GET/POST …/shipments`, `GET/PATCH …/:id`, `POST …/:id/orders`, `DELETE …/:id/orders/:orderId`, `POST …/:id/status` | Lots de groupage | `shipping.*` |

## 4. Réglages et variables d'environnement

**Réglages** (`PATCH /api/v1/admin/settings`, groupes `payments` et `shipping`) :

| Réglage | Rôle |
|---|---|
| `payments.bank_transfer.account_holder`, `bank_name`, `iban`, `bic`, `instructions`, `expiry_hours` | Virement : coordonnées bancaires, consignes et délai |
| `payments.cash_on_delivery.max_amount_xof`, `countries` | Paiement à la livraison : plafond et pays |
| `shipping.require_billable_method` | Exiger un transporteur facturable quand il en existe un |
| `shipping.tracking_lookup_enabled` | Suivi sans compte |

**Variables d'environnement** (voir `.env.example`, valeurs jamais dans le dépôt) : `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`, `CINETPAY_SECRET_KEY`, `CINETPAY_API_BASE` (facultatif), `MOCK_WEBHOOK_SECRET`, `ALLOW_MOCK_PAYMENTS`, `CRON_SECRET`.

## 5. Tests

| Fichier | Contenu |
|---|---|
| `tests/payment-gateways.test.ts` | Signatures valides et invalides, clés d'événement stables, expurgation du journal, échanges CinetPay sur réseau simulé, choix du prestataire |
| `tests/server/payments-api.test.ts` | Moyens proposés selon le pays, le montant et les réglages, avec les règles par pays ; intention unique pour deux vendeurs ; notification à signature invalide, montant faux, **rejouée** et **reçue deux fois** ; refus puis virement confirmé ; paiement concurrent annulé ; paiement à la livraison ; expiration avec vérification préalable ; paiement tardif ; remboursements partiel et total |
| `tests/server/shipping-api.test.ts` | Grilles par zone (tranches non mélangées, route publique comprise) ; devis du panier ; transporteur exigé, inconnu, facturé ; livraison offerte ; transport « à confirmer » ; points relais ; lots de groupage et effets sur les commandes ; suivi client et sans compte ; lien de suivi construit |
