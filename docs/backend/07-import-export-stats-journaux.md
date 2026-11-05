# Backend mybigmarket — Étape 7 : import/export, statistiques, journaux et tâches planifiées

Ce document décrit ce que l'étape 7 ajoute. Les étapes précédentes sont décrites dans les documents 02 à 06 de ce dossier.

## 1. Mise à jour de la base de production

La migration `0019` s'applique comme les précédentes, après avoir créé une branche de sauvegarde dans Neon :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
```

Elle est additive : elle crée sept tables et ne modifie aucune donnée existante.

| Table | Rôle |
| --- | --- |
| `import_jobs` | un import : fichier, options, état, compteurs |
| `import_job_rows` | une ligne du fichier : valeurs lues, action prévue, résultat, messages |
| `error_logs` | journal des erreurs serveur |
| `stats_daily` | statistiques quotidiennes |
| `stats_daily_products` | ventes quotidiennes par produit |
| `scheduled_tasks` | état des tâches planifiées |
| `scheduled_task_runs` | historique des exécutions |

## 2. Import CSV

### Principe

Un import se fait en deux temps : une **simulation**, puis l'**import réel**.

**1. Simulation.** Elle est déclenchée par `POST /admin/imports`, avec `run` à faux (valeur par défaut). Le fichier est lu, chaque en-tête est reconnu, et **chaque ligne est validée contre l'état réel du catalogue**. La simulation contrôle :

- les références et SKU existants ;
- les catégories, marques et vendeurs ;
- les doublons à l'intérieur du fichier ;
- le droit de publier ;
- les bornes et codes-barres, avec le même schéma que l'API.

**Rien n'est écrit dans le catalogue** : seul le rapport est enregistré. Il donne :

- l'action prévue par ligne (création, mise à jour, ignorée, erreur) ;
- chaque message, avec sa ligne dans le fichier (l'en-tête est la ligne 1) et sa colonne.

**2. Import réel.** Il est lancé par `POST /admin/imports/:id/run`, ou directement avec `run: true`.

- Les lignes valides sont écrites **une par une, dans l'ordre du fichier**, par les mêmes services que l'administration : validation, slug unique, stock initial passé par le grand livre, audit, événements.
- Chaque ligne est replanifiée sur l'état courant du catalogue juste avant d'être écrite.
- **Une ligne en erreur n'empêche pas les autres.**

**3. Lots.** Un lot dure 8 secondes au plus, ce qui tient même dans les limites d'exécution les plus courtes.

- **Suite automatique.** L'import continue juste après la réponse HTTP, puis :
  - à chaque `POST /admin/imports/:id/process` (le back-office l'appelle pour suivre l'avancement) ;
  - sinon, chaque nuit, avec la tâche planifiée `imports.resume`.
- **Une ligne n'est jamais écrite deux fois.** Un verrou en base empêche deux lots de tourner en même temps.
- **Annulation.** `POST /admin/imports/:id/cancel` arrête l'import : les lignes non traitées sont marquées « ignorées ».

**Limites.**

- 5 000 lignes par fichier.
- 4 Mo par envoi (le corps des requêtes Vercel est limité à 4,5 Mo).

**Format accepté.** Le CSV est en UTF-8, avec ou sans BOM. Le séparateur `;`, `,` ou la tabulation est détecté automatiquement. Les guillemets et les retours à la ligne dans une cellule sont gérés.

**Formats de cellule.**

| Donnée | Formats acceptés |
| --- | --- |
| Montants | `12500`, `12 500`, `12500,00`, `12.500` |
| Oui/non | `oui`, `non`, `1`, `0`, `vrai`, `faux`, `x` |
| Listes | séparées par `\|` |
| Statuts | libellés français : `brouillon`, `en_attente`, `approuve`, `publie`, `refuse`, `archive` |
| Visibilité | `partout`, `catalogue`, `recherche`, `nulle_part` |
| État | `neuf`, `occasion`, `reconditionne` |

**Cellule vide.** Lors d'une mise à jour, elle ne modifie rien.

### Produits

**Clé.** La colonne `reference` sert de clé : une référence connue met le produit à jour, sinon le produit est créé.

**Colonnes du modèle.** Chaque colonne accepte aussi des variantes d'en-tête, en français ou en anglais (voir `GET /admin/imports/entities`).

| Colonne | Contenu |
| --- | --- |
| `reference` | clé de mise à jour |
| `titre`\* | nom du produit |
| `prix`\* | HT, entier en FCFA |
| `categorie`\* | slug, nom, numéro ou chemin `Maison > Cuisine` |
| `categories_supplementaires` | autres catégories |
| `marque` | slug, nom ou numéro |
| `vendeur`\* | e-mail ou identifiant du compte vendeur |
| `quantite` | stock initial, à la création seulement |
| `statut`, `visibilite`, `etat` | voir les formats ci-dessus |
| `resume`, `description` | textes de la fiche |
| `ean13`, `sku` | codes |
| `poids_g`, `quantite_minimale`, `delai_jours`, `prix_achat` | entiers |
| `etiquettes` | séparées par `\|` |
| `mis_en_avant` | oui ou non |
| `meta_titre`, `meta_description`, `slug` | SEO |

\* Obligatoire pour créer un produit.

**Options** (champ `options` de la requête).

| Option | Rôle |
| --- | --- |
| `updateExisting` | défaut vrai ; à faux, un produit existant est ignoré |
| `seller` | vendeur des lignes sans colonne `vendeur` |
| `createCategories` | crée au premier niveau une catégorie inconnue (une seule fois même si plusieurs lignes la demandent) |
| `createBrands` | crée une marque inconnue, de la même façon |
| `defaultStatus` | statut des produits créés sans colonne `statut` |

**Stock d'un produit existant.** Il ne se modifie pas par l'import des produits, qui le signale par un avertissement. Il passe par l'import du stock (`/admin/stock/import`), qui garde l'inventaire tracé.

### Catégories et marques

**Clé.** Le slug s'il est fourni, sinon le nom (sans accents ni casse). Pour une catégorie, la correspondance par nom se fait sous le même parent.

**Parent d'une catégorie.** Il peut avoir été créé plus haut dans le même fichier, désigné par slug, nom ou chemin.

**Colonnes.**

| Entité | Colonnes |
| --- | --- |
| Catégories | `nom`, `slug`, `parent`, `description`, `actif`, `position`, `image`, `meta_titre`, `meta_description` |
| Marques | `nom`, `slug`, `description`, `actif`, `logo`, `meta_titre`, `meta_description` |

### API (permission `catalog.import`)

Écrire des produits demande aussi la permission de créer ou modifier des produits. Publier demande `catalog.products.publish`.

| Méthode et chemin | Rôle |
| --- | --- |
| `GET /admin/imports/entities` | types d'import, colonnes reconnues, aide |
| `GET /admin/imports/templates/:entity` | modèle CSV (en-têtes et ligne d'exemple) |
| `POST /admin/imports` | analyser et simuler, ou lancer si `run` |
| `GET /admin/imports`, `GET /admin/imports/:id` | imports ; état et premières lignes à corriger |
| `GET /admin/imports/:id/rows?status=error` | rapport ligne par ligne, paginé |
| `GET /admin/imports/:id/report.csv` | rapport à ouvrir dans un tableur |
| `POST /admin/imports/:id/run`, `/process`, `/cancel` | lancer, faire avancer, arrêter |

## 3. Export CSV

**Format commun.** Fichiers UTF-8 avec BOM (ouverture directe dans Excel), séparateur `;`.

**Injection de formule.** Elle est neutralisée : une cellule qui commence par `=`, `+`, `-` ou `@` est préfixée d'une apostrophe.

**Pagination.** 5 000 lignes par page (`?page=`). Les en-têtes `x-total-count`, `x-page` et `x-total-pages` permettent de récupérer la suite.

| Méthode et chemin | Permission | Contenu |
| --- | --- | --- |
| `GET /admin/exports/products.csv` | `catalog.export` | mêmes colonnes que l'import ; filtres `status`, `categoryId`, `sellerId` ; `withStock=1` ajoute la quantité |
| `GET /admin/exports/categories.csv` | `catalog.export` | parents avant enfants |
| `GET /admin/exports/brands.csv` | `catalog.export` | marques |
| `GET /admin/exports/customers.csv` | `customers.export` | clients actifs, consentements, nombre et total des commandes valides |
| `GET /admin/exports/orders.csv` | `orders.export` | filtres `from`, `to`, `status` |

**Aller-retour.** Les exports du catalogue se réimportent tels quels : un fichier exporté, modifié dans un tableur puis réimporté, met les fiches à jour.

**Données personnelles.** Les exports de clients et de commandes sont **journalisés dans l'audit** (qui, quand, combien de lignes, avec quels filtres).

## 4. Statistiques

### Agrégats quotidiens

`stats_daily` et `stats_daily_products` sont calculées par quelques requêtes ensemblistes, et non jour par jour. Elles sont **recalculables à tout moment** : un jour recalculé remplace l'ancien.

**Jour de référence.** C'est la date UTC, qui est aussi l'heure d'Abidjan.

**Commande valide.** Une commande payée, ou confirmée (paiement à la livraison), jusqu'au versement au vendeur. Les commandes en attente de paiement, annulées ou remboursées ne comptent pas dans le chiffre d'affaires.

**Indicateurs par jour.**

| Indicateur | Définition |
| --- | --- |
| Commandes | toutes les commandes, et les commandes valides |
| Chiffre d'affaires | commandes valides, livraison détaillée à part |
| Articles vendus | retours déduits |
| Annulations | commandes annulées |
| Remboursements effectués | montants remboursés |
| Nouveaux clients | comptes clients créés |
| Acheteurs | clients ayant passé une commande valide |
| Paniers créés | paniers ouverts |

Par produit : unités, chiffre d'affaires, nombre de commandes, avec le vendeur et la catégorie.

### Fraîcheur

**À la lecture.** Les jours absents d'une période sont calculés quand on la consulte. Le jour courant est recalculé s'il date de plus de 10 minutes.

**Chaque nuit.** La tâche `stats.refresh` recalcule les 7 derniers jours, ce qui intègre les paiements, annulations et remboursements tardifs.

**À la demande.** `POST /admin/stats/refresh` recalcule une période de 400 jours au plus.

### API (permission `analytics.read`)

**Période.** Les routes prennent `from` et `to` (AAAA-MM-JJ). Par défaut, les 30 derniers jours ; 400 jours au plus.

| Chemin | Contenu |
| --- | --- |
| `GET /admin/stats/overview` | totaux, panier moyen, taux de transformation des paniers, période précédente de même durée, évolution en %, série quotidienne |
| `GET /admin/stats/products`, `/categories`, `/sellers` | classements par chiffre d'affaires ou par unités (`sort=units`) |
| `GET /admin/stats/customers` | meilleurs clients |
| `GET /admin/stats/daily.csv` | série quotidienne pour un tableur |
| `POST /admin/stats/refresh` | recalcul d'une période |

## 5. Journal des erreurs

### Ce qui y entre

| Source | Erreurs enregistrées |
| --- | --- |
| API | toute erreur 500, avec l'identifiant de requête communiqué au client, la route, la méthode et le chemin |
| Tâches planifiées | toute exécution en échec |
| Événements | un événement abandonné après 5 tentatives ; l'échec d'un traitement lancé après la distribution (envoi des e-mails…) |

**Protection des données.** Les champs sensibles du contexte (mots de passe, jetons, clés, cartes) sont masqués. Le client, lui, ne reçoit jamais le détail technique.

**Regroupement.** Les répétitions d'un même problème partagent une **empreinte**, calculée en ignorant les nombres, les identifiants et les valeurs citées.

**Sans risque.** L'enregistrement ne lève jamais d'erreur : une base indisponible n'aggrave pas l'incident d'origine.

### API

| Méthode et chemin | Permission | Rôle |
| --- | --- | --- |
| `GET /admin/error-logs` | `logs.read` | liste filtrable ; `filter[resolvedAt][null]=true` pour les erreurs ouvertes ; `filter[requestId]=` |
| `GET /admin/error-logs/groups` | `logs.read` | une ligne par problème (occurrences, première et dernière date) |
| `GET /admin/error-logs/:id` | `logs.read` | pile, contexte, nombre d'occurrences |
| `POST /admin/error-logs/resolve` | `system.manage` | résoudre par identifiants ou par empreinte ; journalisé |

## 6. Tâches planifiées

### Fonctionnement

**Déclenchement.** Les tâches sont déclarées dans `server/modules/maintenance/tasks.ts`. Les routes `/api/cron/*` les exécutent ; elles sont appelées par Vercel Cron avec `Authorization: Bearer CRON_SECRET`, vérifié à temps constant.

**Garanties.**

- **Historique.** Chaque exécution est enregistrée : déclencheur, durée, résultat ou erreur.
- **Verrou.** Un verrou en base empêche deux exécutions simultanées.
- **Désactivation.** Une tâche désactivée n'est plus lancée par le planificateur, mais reste exécutable à la main.
- **Échec visible.** Une exécution en échec rend une réponse 500 (visible dans les journaux Vercel) et entre au journal des erreurs.

### Tâches

| Tâche | Route cron | Heure (UTC) | Rôle |
| --- | --- | --- | --- |
| `payments.expire` | `/api/cron/expire-orders` | 00:00 | rapprochement des paiements en attente, annulation des commandes non payées dans le délai |
| `shipping.purge_quotes` | `/api/cron/expire-quotes` | 01:00 | devis de transport expirés |
| `events.dispatch` | `/api/cron/dispatch-events` | 02:30 | événements et envois restés en attente |
| `stats.refresh` | `/api/cron/maintenance` | 03:40 | statistiques des 7 derniers jours |
| `imports.resume` | `/api/cron/maintenance` | 03:40 | reprise des imports interrompus |
| `maintenance.purge` | `/api/cron/maintenance` | 03:40 | nettoyage technique (voir ci-dessous) |

**Cadence.** L'offre Vercel Hobby n'autorise qu'une exécution par jour et par tâche. Les traitements urgents ont donc lieu juste après chaque requête :
- l'envoi des e-mails ;
- la suite d'un import.

La tâche planifiée n'est qu'un filet de sécurité.

**Nettoyage technique.** Il ne supprime **aucune donnée métier** (commande, produit, client, événement), seulement :

| Données | Conservation |
| --- | --- |
| Compteurs de débit et clés d'idempotence | jusqu'à expiration |
| Historique des tâches | 90 jours |
| Rapports d'import | 90 jours (les produits importés restent) |
| Erreurs résolues | 90 jours |
| Erreurs non résolues | 180 jours |

### API

| Méthode et chemin | Permission | Rôle |
| --- | --- | --- |
| `GET /admin/tasks` | `system.read` | fréquence, activation, dernier passage, exécution en cours |
| `PATCH /admin/tasks/:code` | `system.manage` | activer ou désactiver (journalisé) |
| `POST /admin/tasks/:code/run` | `system.manage` | exécuter maintenant (journalisé) |
| `GET /admin/tasks/:code/runs` | `system.read` | historique |

## 7. Variables d'environnement

Aucune nouvelle variable. `CRON_SECRET` (déjà présente) protège aussi la nouvelle route `/api/cron/maintenance`.

## 8. Tests

| Fichier | Couverture |
| --- | --- |
| `tests/server/imports-api.test.ts` | **simulation de 1 000 produits** sans aucune écriture (4 erreurs repérées à la bonne ligne et à la bonne colonne) ; rapport CSV ; import réel isolant les erreurs ; stock initial tracé ; mise à jour par référence ; lots reprenables avec verrou ; annulation ; création des catégories et marques ; arborescence dans un même fichier ; droits ; exports réimportables ; injection de formule |
| `tests/server/operations-api.test.ts` | statistiques (totaux, période précédente, classements, recalcul après changement de statut, CSV) ; journal des erreurs (erreur 500 sans fuite, regroupement, résolution) ; tâches (historique, verrou, désactivation, routes cron) ; nettoyage sans perte de données métier |
