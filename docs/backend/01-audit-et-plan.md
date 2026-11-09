> **Note (novembre 2026)** : le back-office séparé décrit dans ce document a été supprimé. L'administration est désormais intégrée au projet principal, sous `/gestion` (voir le README). Ce document reste un historique de la conception de l'API.

# Backend mybigmarket — Étape 1 : audit du dépôt et plan

> Audit réalisé le 4 novembre 2026 sur `main` (commit `114edd5`).
> Périmètre cible : couverture fonctionnelle d'une solution e-commerce complète (20 modules),
> écrite de zéro en TypeScript, en suivant la stack et les conventions déjà présentes.

## 1. Ce qui existe

### Stack en place (conservée)

| Couche | Choix du dépôt |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Base | PostgreSQL Neon + **Drizzle ORM** (`lib/db/schema.ts`, 1 506 lignes) |
| Migrations | 14 migrations `drizzle/0000…0013`, `migrate-all.sql` généré, `drizzle-kit check` en CI |
| Validation | Zod 4 |
| Auth boutique | Auth.js v5 (Credentials), bcrypt, rôles `buyer` / `seller` / `admin` |
| Auth back-office | App séparée l'ancien back-office (supprimé) (projet Vercel distinct), Auth.js, bcrypt, **TOTP 2FA**, sessions invalidées au changement de mot de passe |
| Fichiers | Vercel Blob (public pour les images, privé pour les justificatifs) |
| Tâches planifiées | Vercel Cron : `expire-orders`, `expire-quotes` |
| Tests | Vitest, 16 fichiers, 319 tests (règles métier pures) |
| CI | GitHub Actions : lint, `tsc`, `drizzle-kit check`, tests, build (boutique + admin) |

### Modèle de données : 103 tables, 34 enums

Le schéma couvre déjà presque tout le périmètre : catalogue (produits, déclinaisons, groupes et valeurs d'attributs, caractéristiques, packs, personnalisations, étiquettes, fichiers joints, redirections), prix dégressifs, codes promo, clients, groupes, adresses, consentements, paniers, commandes, statuts et historique, factures, avoirs, retours, remboursements, séquences de numérotation, transport (méthodes, zones, tarifs, règles, paliers, devis), moyens de paiement, taxes (règles et groupes), devises, pays, états, langues, traductions, CMS, bannières, modèles et file d'e-mails, modules, hooks, clés API, réglages, journaux d'audit.

Conventions observées : UUID (`defaultRandom`) sur la plupart des entités, `createdAt`/`updatedAt` avec fuseau, `deletedAt` (suppression logique) et `version` (verrou optimiste) sur les entités sensibles, montants en **entiers XOF**, 138 index et 90 index uniques.

### Logique métier déjà écrite et testée (fonctions pures)

| Fichier | Contenu |
|---|---|
| `lib/pricing.ts` | prix spécifiques, prix dégressifs, prix unitaire, HT/TTC |
| `lib/taxes.ts` | résolution du taux par pays/région, TTC ↔ HT, conversion de devise |
| `lib/catalog-rules.ts` | EAN-13/UPC/ISBN, références, slugs, génération des déclinaisons, stock disponible (packs inclus), règles de vente en rupture, visibilité |
| `lib/order-rules.ts` | statuts et transitions autorisées, totaux de commande, répartition pro rata, factures, retours, remboursements |
| `lib/customer-rules.ts` | normalisation téléphone et e-mail, adresses, remises de groupe, fusion de paniers, anonymisation RGPD |
| `lib/shipping-quote.ts` | résolution de zone, tarifs par poids/montant, paliers de remise, devis de transport |
| `lib/document-numbers.ts` | numérotation séquentielle verrouillée (`FOR UPDATE`) |
| `lib/hooks.ts` | registre de hooks, exécution après commit, erreurs isolées |
| `lib/email-service.ts` | file d'e-mails (`FOR UPDATE SKIP LOCKED`), reprise sur échec |
| `lib/payments/provider.ts` | interface `PaymentProvider` + implémentation Mock (HMAC) |

### Points d'entrée

- **Boutique** : server actions (`actions/*.ts`) pour l'authentification, le checkout, la messagerie, les devis, les avis et les vendeurs ; route handlers `/api/webhooks/payment` (HMAC, idempotent), `/api/transport/devis` (avec limite de débit en mémoire), `/api/exchange-rates`, `/api/health`, `/api/cron/*`.
- **Back-office** (l'ancien back-office (supprimé)) : 33 pages server-side avec server actions (catalogue, stock, clients, commandes, retours, factures, transport, employés, sécurité, service client), contrôle `requireEmployee(permission)` sur chaque action, export CSV des commandes.

## 2. Ce qui est incomplet ou cassé

### Bloquant

1. **La base de production n'est pas à jour.** `GET /api/health` répond 503 `schema` : la table `document_sequences` (migration `0013`) est absente. La boutique tourne en mode démonstration de secours. *Action côté propriétaire* : appliquer les migrations sur Neon (voir § 5, décision D1).
2. **La logique métier testée n'est pas branchée.** `computeOrderTotals`, `computeUnitPrice`, `resolveTaxRate`, `applyStockMovement`, `mergeCarts`, `bestGroupDiscount`, `validateReturn`, `canSell`, `generateCombinations` ne sont appelées par **aucune** route ni action. Le checkout recalcule ses totaux en ligne et vérifie le stock sans le réserver.
3. **Hooks et e-mails non câblés.** `runHook` et `enqueueEmail` / `processEmailQueue` ne sont appelés nulle part : aucun événement n'est émis, aucun e-mail n'est envoyé, aucune tâche ne vide la file.
4. **Survente possible.** Le checkout lit le stock puis crée les commandes sans verrou ni décrément atomique.

### Dette structurelle

5. **Deux copies du schéma et des règles.** l'ancien schéma du back-office (607 lignes, sous-ensemble écrit à la main) et des copies de `order-rules`, `customer-rules`, `shipping-quote` et `document-numbers`. Des tests de synchronisation limitent la dérive, mais toute évolution doit être faite deux fois.
6. **34 tables sans aucun code** : `addresses`, `promo_codes`, `tax_rules`, `tax_rule_groups`, `stock_movements`, `inventory_movements`, `order_status_history`, `return_requests`, `cms_pages`, `attribute_groups`, `attribute_values`, `product_categories`, `pack_items`, `product_tags`, `customer_consents`, `module_hooks`, `employee_sessions`, etc.
7. **Doublons de concept** à unifier : `stock_movements` et `inventory_movements` ; `tax_rules` et `tax_rule_groups` ; `product_attributes` (clé/valeur libre) et `attribute_groups`/`attribute_values` ; `activity_logs`, `admin_audit_log` et `employee_audit_logs`.
8. **Trois identités** : `users` (boutique, rôle `admin` hérité), `customers` (profil client, lié par `userId`) et `employees` (back-office). Le rôle `users.admin` fait doublon avec les employés.
9. **Logique dans les points d'entrée.** Les server actions mêlent validation, règles et SQL : pas de couche service/repository, pas d'API REST, pas d'OpenAPI.

### Sécurité

10. Mots de passe en **bcrypt** (cible : argon2id).
11. Limite de débit **en mémoire** uniquement, sur une seule route (inefficace sur Vercel, où chaque instance a sa propre mémoire).
12. Pas d'en-têtes de sécurité centralisés côté boutique, ni de CORS explicite, ni de clé d'idempotence sur la création de commande.
13. Paiement : Mock uniquement ; l'interface n'a ni `confirm` ni `refund`.

## 3. Ce qui manque par rapport au périmètre

Légende : ✅ en place · 🟡 partiel (schéma ou règles sans API) · ❌ absent

| # | Module | État | Manque principal |
|---|---|---|---|
| 1 | Catalogue | 🟡 | API REST, services, packs/virtuels, arbre de catégories (table de liaison inutilisée), images de déclinaison |
| 2 | Prix et promotions | 🟡 | règles de promotion catalogue, bons de réduction complets (cumul, par client, livraison gratuite), prix barré calculé |
| 3 | Stocks | 🟡 | entrepôts, réservation et libération, mouvements tracés unifiés, alertes stock bas, import/export |
| 4 | Clients | 🟡 | API compte client, adresses multiples (table inutilisée), consentements, export RGPD, invités |
| 5 | Panier et commandes | 🟡 | panier serveur persistant et fusion, service de calcul unique, tunnel en API, statuts personnalisables branchés, PDF, RMA |
| 6 | Livraison | 🟡 | calcul solide en place ; manquent l'API boutique, le suivi de colis et les restrictions par produit |
| 7 | Paiement | ❌ | `initiate`/`confirm`/`refund`, Wave, Orange Money, MTN MoMo, paiement à la livraison, virement, journal des transactions |
| 8 | Taxes, devises, pays | 🟡 | service de résolution branché, administration des règles |
| 9 | CMS | ❌ | pages, blocs, menus, formulaires (seules les tables `cms_pages` et `banners` existent) |
| 10 | SEO et URLs | 🟡 | sitemap, robots et JSON-LD faits ; redirections 301 (table inutilisée), slugs uniques centralisés |
| 11 | Recherche | ❌ | `tsvector`, `unaccent`, facettes, tri par ventes |
| 12 | Communication | 🟡 | file d'e-mails écrite mais non branchée, modèles éditables, adaptateur WhatsApp |
| 13 | Service client | 🟡 | conversations en place ; tickets, assignation, modèles de réponse |
| 14 | Équipe et permissions | 🟡 | rôles, permissions et TOTP en place ; matrice par module × action à formaliser et exposer en API |
| 15 | Paramètres | 🟡 | table clé/valeur non typée, pas de cache, pas de portée boutique |
| 16 | Statistiques | ❌ | agrégats pré-calculés |
| 17 | Import/export | 🟡 | export CSV des commandes seulement |
| 18 | Journaux et système | 🟡 | trois tables d'audit ; journal d'erreurs, sauvegardes et tâches planifiées à structurer |
| 19 | Multi-boutique | ❌ | aucune colonne `shop_id` |
| 20 | IA intégrée | ❌ | tout le module (proposition, validation, journal, quotas) |

## 4. Architecture cible (dans le dépôt existant)

Un seul backend, dans l'application Next.js racine, consommé par la boutique **et** par l'ancien back-office.

```text
server/
  core/            http (erreurs { code, message, details }, pagination ?page&limit&sort&filter[]),
                   auth (sessions, argon2id), permissions, events (bus + hooks), modules (registre),
                   audit, settings (typés + cache), rate-limit, idempotency, shop-context, logger
  modules/
    catalog/       schema.ts · repository.ts · service.ts · validators.ts · events.ts · routes/ · *.test.ts
    pricing/  stock/  customers/  cart/  orders/  shipping/  payments/  taxes/  cms/  seo/
    search/   notifications/  support/  team/  settings/  stats/  import-export/  system/  ai/
app/api/v1/
  shop/…           route handlers fins : validation Zod → service → réponse
  admin/…          idem + contrôle de permission module × action
  openapi.json     généré depuis les schémas Zod
```

Règles : route → service → repository, jamais de SQL dans les routes ; les règles pures actuelles de `lib/*.ts` deviennent le cœur des services (elles sont déplacées, pas réécrites) ; `lib/db/schema.ts` reste la source unique du schéma, et l'ancien back-office cessera progressivement d'en garder une copie en appelant `/api/v1/admin`.

## 5. Décisions à valider avant l'étape 2

| Code | Question | Recommandation |
|---|---|---|
| D1 | Mettre la base de production à jour (migration `0013` manquante) | L'appliquer après sauvegarde Neon (branche de secours), depuis un poste contrôlé. Je fournis la procédure ; je n'ai pas accès à la base. |
| D2 | File d'attente, cache et limite de débit : Upstash Redis ou PostgreSQL ? | Interface unique avec **PostgreSQL d'abord** (la file d'e-mails `SKIP LOCKED` existe déjà) et adaptateur Upstash activé par variable d'environnement. Pas de nouveau service à payer tant que le trafic est faible. |
| D3 | Où vit l'API ? | Dans l'application racine (`/api/v1/shop`, `/api/v1/admin`). l'ancien back-office reste l'interface et migre écran par écran vers l'API. |
| D4 | Identités | `users` = identifiants de connexion boutique, `customers` = profil client, `employees` = équipe. Le rôle `users.admin` est déprécié et remplacé par les employés. |
| D5 | Doublons de tables | Garder `stock_movements`, `tax_rule_groups`, `attribute_groups`/`attribute_values` et `employee_audit_logs` comme références. Les anciennes tables restent en place, sans nouvelle écriture, jusqu'à migration des données. |
| D6 | Marketplace | Conserver la dimension vendeur (`sellerId`, commande par vendeur, séquestre) **en plus** du `shopId` multi-boutique. |
| D7 | Mots de passe | Passer à argon2id avec ré-hachage transparent à la connexion : les anciens hashes bcrypt restent valides. |

## 6. Plan par étapes

Chaque module donne lieu à un commit (schéma/migration → repository → service → routes → tests).

| Étape | Contenu | Livrables vérifiables |
|---|---|---|
| **2. Fondations** | `server/core` (erreurs, pagination/tri/filtres, logger), auth argon2id + rotation de session, équipe et matrice de permissions, paramètres typés et mis en cache, journal d'audit unifié, bus d'événements + registre de modules (branché sur `lib/hooks.ts`), contexte boutique (`shop_id`, migration non destructive), limite de débit et idempotence, OpenAPI | `/api/v1/admin/employees`, `/settings`, `/audit-logs`, `/modules` ; tests de permissions ; `openapi.json` |
| **3. Catalogue, prix, stocks** | produits (simple, déclinaisons, pack, virtuel), arbre de catégories, marques, fournisseurs, attributs, caractéristiques, images, SEO ; prix spécifiques, promotions, bons ; entrepôts, mouvements, réservation, alertes | CRUD admin + listes publiques ; tests prix/stock ; événements `product.updated`, `stock.low` |
| **4. Clients, panier, commandes, taxes, devises** | comptes, adresses, groupes, RGPD ; panier serveur et fusion ; **service de calcul unique** ; tunnel ; statuts et historique ; factures/avoirs PDF ; RMA ; taxes et devises branchées | test d'intégration du tunnel complet ; `order.created` |
| **5. Livraison, paiement** | API livraison, suivi ; `PaymentProvider` complet ; paiement à la livraison, virement, Wave, Orange Money, MTN MoMo, carte via passerelle ; webhooks signés et idempotents ; journal des transactions | tests de webhooks rejoués, signature invalide, double livraison |
| **6. Communication, CMS, SEO, recherche** | modèles d'e-mails, file branchée sur les événements, adaptateur WhatsApp ; pages, blocs, menus, formulaires ; redirections 301 ; recherche `tsvector` + `unaccent`, facettes | e-mail de confirmation envoyé via la file ; recherche tolérante aux accents |
| **7. Import/export, stats, journaux, cron** | imports CSV ligne par ligne avec simulation et rapport ; exports ; agrégats ; journal d'erreurs ; tâches planifiées | import de 1 000 produits en simulation |
| **8. Service client, IA, multi-boutique** | tickets, assignation, modèles ; assistant Claude (propositions validées, journal, quotas) ; middleware de contexte boutique | propositions IA jamais appliquées sans confirmation |
| **9. Durcissement** | tests de bout en bout, en-têtes de sécurité, CSRF, CORS, revue des index, README, diagramme de la base, OpenAPI complet | CI verte, audit de sécurité |
