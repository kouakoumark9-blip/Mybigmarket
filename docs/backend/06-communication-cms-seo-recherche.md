# Backend mybigmarket — Étape 6 : communication, CMS, SEO et recherche

Ce document décrit ce que l'étape 6 ajoute. Les étapes précédentes sont décrites dans [02-fondations.md](./02-fondations.md), [03-catalogue-prix-stocks.md](./03-catalogue-prix-stocks.md), [04-clients-panier-commandes.md](./04-clients-panier-commandes.md) et [05-livraison-paiement.md](./05-livraison-paiement.md).

## 1. Mise à jour de la base de production

La migration `0018` s'applique comme les précédentes, après avoir créé une branche de sauvegarde dans Neon :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
```

Elle est additive et ne modifie aucune donnée existante.

**Extensions PostgreSQL.** `unaccent` et `pg_trgm` sont des extensions « de confiance » : le propriétaire de la base peut les installer, ce que fait la migration.

**Fonctions et index de recherche.**

- `mbm_unaccent(text)` : version indexable de `unaccent`.
- `mbm_product_document(titre, référence, résumé, description)` : document de recherche d'un produit, en français, sans accents.
- Deux index GIN sur `products` : un sur ce document, un sur les trigrammes du titre sans accents.

**Tables nouvelles.**

| Table | Rôle |
| --- | --- |
| `menus`, `menu_items` | Menus de navigation. La migration crée `header` et `footer`, et remplit le pied de page avec les pages existantes. |
| `forms`, `form_submissions` | Formulaires et réponses. Un formulaire `contact` est livré prêt à l'emploi. |
| `outbound_messages` | File des messages WhatsApp. |

**Colonnes ajoutées.**

| Table | Colonnes |
| --- | --- |
| `cms_pages` | `blocks`, `excerpt`, `created_at` |
| `banners` | `placement` |
| `slug_redirects` | code HTTP, compteur de passages, dernière utilisation, note, date de modification |
| `email_queue` | clé anti-doublon (unique), langue |

## 2. Communication

### Principe

Les notifications suivent toujours le même chemin, de l'événement à l'envoi :

1. Les services publient des **événements de domaine** dans la boîte d'envoi (`domain_events`), dans la même transaction que la donnée.
2. Le module **Notifications clients** (`customer-notifications`, actif par défaut) est abonné à ces événements. Il **met en file** un e-mail, et un message WhatsApp si ce canal est activé.
3. La file est **envoyée juste après la distribution des événements**, après la réponse HTTP. La tâche planifiée `/api/cron/dispatch-events` reprend ce qui reste.

**Une notification n'est jamais envoyée deux fois.** Chaque entrée porte une clé anti-doublon unique (par exemple `order_confirmation:<groupe de passage en caisse>`). Rejouer un événement ne crée donc pas de doublon.

**Reprise en cas d'échec.** Un envoi qui échoue est retenté jusqu'à 3 fois, à 5 minutes d'intervalle. Les entrées sont verrouillées pendant l'envoi (`SKIP LOCKED`), ce qui permet à plusieurs exécutions en parallèle de ne jamais envoyer le même message.

### Notifications livrées

| Code | Destinataire | Déclencheur |
| --- | --- | --- |
| `order_confirmation` | client | commande passée (un seul e-mail par passage en caisse, même avec plusieurs vendeurs) |
| `payment_confirmed` | client | paiement réglé |
| `payment_failed` | client | paiement refusé (la commande reste payable) |
| `order_shipped` | client | commande expédiée (avec le lien de suivi) |
| `order_delivered` | client | commande livrée |
| `order_cancelled` | client | commande annulée |
| `order_refunded` | client | commande remboursée |
| `refund_completed` | client | remboursement effectué |
| `admin_new_order` | équipe | nouvelle commande, envoyée à l'adresse des notifications internes |
| `form_submission` | équipe | message reçu par un formulaire, avec réponse directe à l'expéditeur |
| `email_test` | équipe | bouton « envoyer un e-mail de test » |

### Modèles d'e-mail

Chaque notification a un **modèle intégré** en français. L'équipe peut le remplacer par sa propre version, par langue, depuis l'administration. Un modèle personnalisé **actif** prend le pas sur le modèle intégré. Le supprimer rétablit le modèle intégré.

**Variables.** `{{nom}}` insère une variable échappée. `{{{nom}}}` insère tel quel un fragment construit par le serveur, comme le tableau des commandes ou les consignes de paiement : ce contenu ne vient jamais d'une saisie.

**Mise en page et texte brut.** Tous les e-mails partagent la même mise en page aux couleurs de la boutique. Une version texte brut est générée automatiquement.

**Contrôle avant envoi.** L'aperçu (`POST /admin/email-templates/:code/preview`) affiche le rendu avec des valeurs d'exemple et signale les variables manquantes.

### WhatsApp

**Adaptateur.** L'adaptateur utilise l'**API Cloud de WhatsApp (Meta)**. Hors fenêtre de conversation, Meta n'autorise que des **modèles approuvés**.

**Configuration du module.** On associe à chaque code de notification :

- le nom du modèle Meta ;
- sa langue ;
- la liste ordonnée des variables transmises.

**Numéros.** Ils sont convertis au format international. Le préfixe pays est choisi selon le pays de livraison. Le 0 initial est conservé pour la Côte d'Ivoire et le Bénin, dont les numéros à 10 chiffres le contiennent.

**Canal désactivé.** Sans les variables `WHATSAPP_*`, ou avec `whatsapp.enabled` à faux (valeur par défaut), aucun message n'est mis en file.

### Configuration du module

| Clé | Rôle |
| --- | --- |
| `email.enabled` | envoi des e-mails (vrai par défaut) |
| `whatsapp.enabled`, `whatsapp.templates` | canal WhatsApp et association des modèles |
| `disabled` | codes de notification à ne pas envoyer |
| `adminAlerts` | alerte « nouvelle commande » à l'équipe |

### API (permissions `communication.read` / `communication.update`)

| Méthode et chemin | Rôle |
| --- | --- |
| `GET /admin/email-templates`, `GET /admin/email-templates/:code` | modèles (intégré et personnalisé) |
| `PUT /admin/email-templates/:code` | enregistrer une version personnalisée |
| `DELETE /admin/email-templates/:code?locale=` | revenir au modèle intégré |
| `POST /admin/email-templates/:code/preview` | aperçu |
| `POST /admin/emails/test` | e-mail de test |
| `GET /admin/emails`, `POST /admin/emails/:id/retry` | file d'envoi, renvoi |
| `POST /admin/notifications/process` | traiter les files immédiatement |
| `GET /admin/whatsapp-messages` | messages WhatsApp |

## 3. CMS

### Pages à blocs

Une page est une suite de **blocs validés**. **Aucun HTML libre n'est accepté.**

| Bloc | Contenu |
| --- | --- |
| `heading` | titre de niveau 2 ou 3 |
| `text` | texte en balisage minimal (voir plus bas) |
| `image` | image interne ou HTTPS, texte alternatif, légende, lien facultatif |
| `cta` | appel à l'action : titre, texte, bouton |
| `faq` | questions et réponses (jusqu'à 50) |
| `columns` | 2 à 4 colonnes |
| `products` | produits choisis (jusqu'à 24) **ou** une catégorie, résolus au rendu avec le prix du client |
| `banners` | bannières d'un emplacement |
| `video` | vidéo YouTube, affichée en mode sans cookies |
| `form` | un formulaire du site |

**Balisage du texte.** Paragraphes séparés par une ligne vide, listes `- `, `**gras**`, `*italique*` et `[lien](/chemin)`.

**Liens autorisés.** Seuls les chemins internes, `https:`, `mailto:` et `tel:` sont acceptés. Un lien `javascript:`, `data:` ou `//hôte` est rendu comme du texte simple.

**Rendu sûr par construction.** Le texte est transformé en nœuds, puis rendu en éléments React. Tout est échappé.

### Publication et redirections

Une page publiée est servie sur `/pages/<slug>` et ajoutée au plan du site.

- **Renommage.** Changer le slug d'une page publiée crée automatiquement une **redirection 301** depuis l'ancienne adresse.
- **Suppression.** Elle est douce, et peut créer une redirection vers une autre adresse.

### Menus

L'en-tête et le pied de page ont chacun leur menu.

- **Structure.** Deux niveaux au plus, 120 entrées au plus. Enregistrer un menu remplace son arbre complet.
- **Cibles.** Une entrée pointe vers une page, une catégorie, un produit, une marque ou une URL. Les liens sont résolus côté serveur : une page dépubliée disparaît du menu.

### Formulaires

Les champs sont configurables (texte, e-mail, téléphone, nombre, zone de texte, liste, case à cocher) et validés côté serveur.

**Protection contre les abus.**

- **Champ piège.** Un champ caché `website` est rempli par les robots. Leur envoi reçoit une réponse de succès mais est ignoré.
- **Limite de débit.** 10 envois par heure et par adresse.
- **Adresse IP.** Elle n'est conservée que sous forme d'empreinte salée.

**Suite donnée à une réponse.** Chaque réponse publie l'événement `form.submitted`, qui notifie l'équipe. Les réponses ont un statut : nouvelle, lue, archivée.

### Bannières

Une bannière est rattachée à un **emplacement** (par exemple `home`) et a une période d'affichage facultative.

### API

Boutique, sans authentification :

| Méthode et chemin | Rôle |
| --- | --- |
| `GET /shop/pages`, `GET /shop/pages/:slug` | pages publiées |
| `GET /shop/menus/:code` | menu résolu |
| `GET /shop/banners?placement=` | bannières en cours |
| `GET /shop/forms/:code`, `POST /shop/forms/:code` | formulaire, envoi |

Administration (permissions `appearance.*`) :

| Chemins | Rôle |
| --- | --- |
| `/admin/pages` | pages : liste, création, détail, modification, suppression |
| `/admin/menus`, `PUT /admin/menus/:code` | menus |
| `/admin/forms`, `/admin/forms/:code/submissions`, `PATCH /admin/form-submissions/:id` | formulaires et réponses |
| `/admin/banners` | bannières |

## 4. SEO : redirections

Les redirections sont **301 (permanentes) ou 302 (temporaires)**, de chemin à chemin. Elles sont gérées par `/admin/redirects` (permissions `seo.read` / `seo.update`).

**Garde-fous.**

- **Boucles.** Une redirection qui reviendrait à son point de départ est refusée.
- **Chaînes.** Elles sont **aplaties** : A → B puis B → C devient A → C.
- **Chemins protégés.** `/api`, `/_next`, `/admin` et la page d'accueil ne peuvent pas être redirigés.

**Chemins inconnus.** Toute adresse inconnue de la boutique passe par la route attrape-tout `app/[...path]`. Celle-ci applique la redirection enregistrée et incrémente son compteur, sinon elle renvoie la page 404.

Les anciennes URL de produits renommés gardent leur propre redirection, mise en place à l'étape 3.

## 5. Recherche

### Plein texte, sans accents ni casse

`GET /shop/products?q=…` cherche dans le **document indexé** de chaque produit. Le document et la requête sont analysés en français, sans accents. Ainsi, « telephone », « Téléphone » et « TÉLÉPHONE » donnent les mêmes résultats, et « creme » trouve « Crème ».

**Où la recherche cherche.**

- **Document indexé.** Il contient le titre et la référence (poids fort), le résumé, puis la description. Chaque mot est cherché en préfixe : « chaus » trouve « chaussures ».
- **Sous-chaîne du titre.** Elle couvre les mots composés.
- **Champs exacts.** La référence, les étiquettes et le code EAN-13 complètent la recherche.

**Classement par pertinence.**

1. Score plein texte.
2. Titre qui commence par la requête.
3. Référence exacte.
4. Similarité.
5. En cas d'égalité, mise en avant puis nouveauté.

**Fautes de frappe.** Si rien ne correspond exactement, une seconde passe compare la requête au titre par **trigrammes**, au seuil de similarité de mots 0,6 : « chausure » trouve « Chaussures ». La réponse l'indique par `meta.fuzzy: true`.

**Sécurité.** La requête PostgreSQL est construite à partir des seuls mots alphanumériques de la saisie. Aucun opérateur (`&`, `|`, `!`, `:*`, guillemets) saisi par le client n'atteint la base, et toutes les valeurs passent en paramètres.

**Performance.** Les trois conditions utilisent les index GIN de la migration `0018` : document, trigrammes pour les fautes de frappe, et sous-chaîne `LIKE '%…%'`.

### Facettes

Ajouter `facets=1` renvoie `meta.facets`, qui contient :

- `categories` et `brands` : nombre de produits par choix ;
- `price` : prix minimal, prix maximal et tranches non vides, en XOF HT (0–5 000, 5 000–10 000, 10 000–25 000, 25 000–50 000, 50 000–100 000, 100 000–250 000, 250 000 et plus) ;
- `availability` : total et nombre de produits en stock ;
- `features` : caractéristiques actives et décompte par valeur prédéfinie.

**Chaque facette ignore son propre filtre.** Choisir une marque laisse voir les autres marques possibles. Les autres facettes, elles, tiennent compte de ce choix.

**Filtre par caractéristiques.** On passe des identifiants de valeurs séparés par des virgules : `features=<id>,<id>`. Les valeurs d'une même caractéristique se combinent en « ou », les caractéristiques entre elles en « et ».

### Tri

Valeurs de `sort` :

- `relevance` (défaut) ;
- `newest` ;
- `price_asc` ;
- `price_desc` ;
- `name` ;
- `best_selling` : unités vendues sur les commandes payées ou confirmées (paiement à la livraison), retours déduits. Les commandes en attente de paiement, annulées ou remboursées ne comptent pas.

### Suggestions

`GET /shop/search/suggest?q=…` (2 caractères minimum) renvoie, pendant la saisie :

- jusqu'à 6 produits, avec la même règle que la recherche, fautes de frappe comprises ;
- jusqu'à 4 catégories ;
- jusqu'à 4 marques, sans tenir compte des accents.

### Boutique web

Le navigateur du catalogue (`/produits`) filtre lui aussi **sans accents ni casse**, et exige chaque mot de la requête. Il utilise la même normalisation (`lib/search.ts`) que le serveur.

## 6. Variables d'environnement

Les variables SMTP existantes (`SMTP_*`) servent à la file d'e-mails. L'étape 6 ajoute :

| Variable | Rôle |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | API Cloud de WhatsApp (facultatif) |
| `WHATSAPP_API_VERSION` | version de l'API Graph (défaut `v21.0`) |

Aucune clé n'est enregistrée dans le dépôt ; voir `.env.example`.

## 7. Tests

Les tests utilisent PGlite, avec les extensions `unaccent` et `pg_trgm` chargées.

| Fichier | Couverture |
| --- | --- |
| `tests/server/notifications-api.test.ts` | e-mail de confirmation mis en file puis envoyé, sans doublon ; modèles personnalisés ; reprise ; WhatsApp |
| `tests/server/cms-api.test.ts` | pages à blocs, rendu sûr, renommage en 301, menus, formulaires (piège, notification), bannières, redirections (boucle, chaîne, route attrape-tout) |
| `tests/server/search-api.test.ts` | recherche avec ou sans accents, préfixes, fautes de frappe, opérateurs neutralisés, facettes, caractéristiques, meilleures ventes, suggestions |
