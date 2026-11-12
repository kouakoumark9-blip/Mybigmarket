# Étape 9 : durcissement, tests de bout en bout, documentation et audit de sécurité

Dernière étape du plan. Elle ne change aucun parcours existant : elle protège ce qui existe, le prouve par des tests et le documente.

## 1. Mise à jour de la base de production

La seule migration de l'étape est **`0021_hardening_indexes`**. Elle ajoute 155 index et ne modifie aucune donnée.

- **Application.** Elle est appliquée à la fusion, comme les précédentes :
  1. création d'une branche de sauvegarde Neon ;
  2. exécution du bloc 0021 de `migrate-all.sql` ;
  3. comparaison de l'empreinte du schéma avec la base de référence locale.
- **Verrous.** Sur les volumes actuels, la création prend quelques secondes. Chaque table n'est verrouillée en écriture que pendant la construction de ses propres index.

## 2. En-têtes de sécurité

Le module `lib/security-headers.ts` s'applique à toutes les réponses de la boutique. Le back-office en garde une copie identique, vérifiée par un test.

| En-tête | Valeur | Effet |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'`, sans `unsafe-eval` en production, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `upgrade-insecure-requests` | aucun script, style, cadre ou appel réseau hors de notre origine |
| `X-Frame-Options` | `DENY` | pas d'intégration dans un cadre (anti-clickjacking) |
| `X-Content-Type-Options` | `nosniff` | pas de détection de type MIME |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (back-office : `same-origin`) | référent réduit hors du site |
| `Permissions-Policy` | caméra, micro, géolocalisation, paiement, USB… coupés | fonctions sensibles du navigateur inaccessibles |
| `Cross-Origin-Opener-Policy` | `same-origin` | fenêtre isolée des autres sites |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (hors développement) | HTTPS imposé |

Exceptions de la CSP, limitées au strict nécessaire :

- images en `https:` (photos du stockage de fichiers et des vendeurs) ;
- vidéos `youtube-nocookie.com` (blocs CMS) ;
- barre d'outils Vercel, **sur les déploiements de prévisualisation uniquement**.

Les scripts en ligne restent autorisés : Next.js en a besoin pour hydrater les pages statiques. Un nonce imposerait le rendu dynamique de toutes les pages (voir §11).

**Vérification.** Builds de production des deux applications : 9 pages de la boutique et 6 du back-office ont été chargées sans aucune violation. Les tests de bout en bout échouent désormais à la moindre violation.

## 3. CSRF et CORS

- **API boutique.** Toute écriture envoyée par un navigateur doit venir de notre origine ou d'une origine listée dans `CORS_ALLOWED_ORIGINS`, que le client soit connecté ou non (cookie de panier invité, formulaires publics). Sinon la réponse est **403**.
  - Les clients hors navigateur, qui n'envoient pas d'en-tête `Origin`, ne portent pas de cookie tiers et restent acceptés.
- **API d'administration.** Elle n'accepte que l'en-tête `Authorization` : un cookie de session volé ne donne aucun accès.
- **Actions serveur Next.js et Auth.js.** La vérification d'origine intégrée et le jeton CSRF d'Auth.js s'appliquent.
- **CORS.**
  - Boutique : même origine, plus les origines listées.
  - Back-office : `ADMIN_CORS_ALLOWED_ORIGINS` uniquement.
  - Jamais `*`, jamais `Access-Control-Allow-Credentials`.

## 4. Limites de débit

Toutes les limites sont partagées entre les instances (PostgreSQL, ou Upstash si configuré) :

| Politique | Limite | Usage |
| --- | --- | --- |
| `auth.login` | 10 par 15 min et par adresse | connexion boutique et API, suivi de colis |
| verrouillage par e-mail | 6 échecs en 15 min | connexion employé : même le bon mot de passe est refusé pendant le blocage |
| `auth.register` | 5 par heure | inscription |
| `shop.cart` | 120 par minute | panier |
| `shop.search` | 60 par minute | recherche |
| `shop.forms` | 10 par heure | formulaires publics, tickets |
| `shop.quote` | 30 par minute | devis transport public (**nouveau** : l'ancien compteur était local à chaque instance) |
| `admin.ai` / `ai` | 10 par minute / 30 par heure | assistant IA |
| `admin.default` / `admin.write` | 600 / 120 par minute | back-office |

## 5. Revue des index

**Règle.** Chaque clé étrangère et chaque colonne proposée en filtre ou en tri par une liste de l'API est indexée.

- `tests/server/indexes.test.ts` le vérifie sur le schéma réellement migré : une nouvelle relation ou une nouvelle liste sans index fait échouer la CI.
- La migration 0021 ajoute :
  - les 84 index de clés étrangères manquants ;
  - 74 index de filtres ou de tris. Pour une colonne booléenne, l'index est composite avec la colonne de tri de la liste.

## 6. Données de démonstration

**Commande.** `npm run db:seed:demo` ajoute au jeu historique un commerce complet, créé **par les services de l'application** : mêmes règles, mêmes écritures de stock, mêmes événements et même audit qu'en usage réel.

**Contenu.**

| Élément | Détail |
| --- | --- |
| Catalogue | arbre de catégories, marque, taxe à 18 % |
| Produits | produit en promotion, produit à 6 déclinaisons avec stock, pack |
| Bon de réduction | `BIENVENUE10` |
| Vendeur | un vendeur vérifié |
| Clients | 3 clients |
| Commandes | 4 : en attente de paiement, payée, expédiée, livrée |
| Service client | un ticket lié à une commande |

**Garde-fous.**

- Le seed est **idempotent** : un second passage ne crée rien.
- Il reste bloqué en production sans `ALLOW_DEMO_SEED=true`.
- Les commandes sont réglées par virement : un moyen manuel, sans prestataire externe.
  - Sur une base vierge, les coordonnées bancaires sont remplies avec des valeurs clairement marquées « démonstration ».
  - Le virement est réactivé s'il avait été désactivé.

## 7. Tests de bout en bout

**Où ils tournent.** Playwright, dans un vrai navigateur, contre les **builds de production** des deux applications, branchés sur **PostgreSQL 16** et remplis par les seeds.

| Scénario | Ce qui est vérifié |
| --- | --- |
| Boutique : en-têtes | statut 200, CSP et `X-Frame-Options` présents |
| Parcours client | recherche, fiche produit, panier, création de compte, tunnel, commande enregistrée, suivi dans l'espace client, demande au service client |
| CSRF | écriture envoyée depuis un autre site refusée |
| Back-office | connexion d'un employé, catalogue et commandes de démonstration, en-têtes |

Dans le parcours client, le montant est contrôlé : **18 054 FCFA**, soit 18 000 − 15 % de promotion, + TVA de 18 %, calculé par le serveur.

**Surveillance.** Chaque page est surveillée : une erreur JavaScript ou une violation de la CSP fait échouer le test.

**Lancement.** En CI, la tâche « Bout en bout » les exécute à chaque PR. En local, voir le README, section « Tests ».

## 8. Assistant IA : compléments du cahier des charges

L'étape 8 n'avait pas livré quatre fonctions. Elles sont ajoutées avec les mêmes garanties : le modèle n'écrit jamais, les droits et les quotas de l'employé s'appliquent, et tout est journalisé.

- **Génération en masse.** Une proposition par produit, 20 au plus, puis **validation groupée** avec `confirm: true`. Chaque application repasse par les contrôles unitaires (droits, version du produit, application unique).
- **Résumé des ventes.** Rédigé à partir des statistiques pré-calculées, sans aucune donnée personnelle. Réservé aux employés qui ont `analytics.read`.
- **Recherche en langage naturel.**
  - Le modèle **ne voit aucune donnée** : il traduit la question en requête de liste.
  - Il n'utilise que les champs, opérateurs et tris autorisés des seules listes permises à l'employé.
  - La requête est revalidée, puis exécutée par la liste existante.

Les routes sont détaillées dans `08-service-client-ia-multiboutique.md`.

## 9. OpenAPI et diagramme de la base

**OpenAPI.** Le document `/api/v1/openapi.json` décrit les **321 routes**. Pour chaque route, il indique :

- résumé, étiquettes, paramètres et corps de requête ;
- sécurité et permission (`x-permission`) ;
- erreurs possibles : 401, 403, 404, 409, 422, 429 (avec `Retry-After`), 500, 503 ;
- limite de débit (`x-rate-limit`), taille maximale du corps et protection CSRF.

Les schémas récursifs (blocs CMS) produisaient des références cassées ; ils sont désormais remontés dans `components.schemas`. `tests/server/openapi.test.ts` vérifie l'ensemble.

**Diagramme de la base.** `schema-base-de-donnees.md` est généré par `npm run docs:db` :

- 136 tables et 221 relations ;
- un diagramme Mermaid par domaine.

`tests/db-diagram-sync.test.ts` échoue s'il n'est plus à jour.

## 10. Audit de sécurité

Chaque exigence du cahier des charges, avec la preuve automatisée correspondante :

| Exigence | Mise en œuvre | Preuve |
| --- | --- | --- |
| Mots de passe hachés avec argon2 | argon2id (`server/core/auth/password.ts`) ; les anciens hachages bcrypt restent valides et sont ré-hachés à la connexion | `core.test.ts`, `auth-copies-sync.test.ts` |
| Sessions ou JWT à rotation, cookies sûrs | jeton d'accès employé de 10 min ; jeton de rafraîchissement à usage unique, rotatif, révocable. Cookies Auth.js et panier : `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS | `admin-api.test.ts`, `checkout-api.test.ts` |
| Contrôle d'accès serveur sur chaque route | pipeline unique : permission par route, contexte boutique, clé d'API limitée à sa boutique. Propriété des ressources : un client ne lit que ses commandes, ses tickets, ses factures | `openapi.test.ts` (permission déclarée partout), `admin-api`, `checkout-api`, `support-api`, `shops-api` |
| Validation Zod, requêtes paramétrées, sorties échappées | Zod sur params, query et corps (`strict`), 1 Mo maximum ; Drizzle et `sql` paramétrés ; tris et filtres sur liste blanche ; React échappe les sorties ; CMS sans HTML libre ; JSON-LD échappé | `hardening.test.ts` (injection SQL, tri non prévu, JSON invalide ou trop gros) |
| Limitation de débit | voir §4 | `hardening.test.ts`, `core.test.ts`, `ai-assistant.test.ts` |
| CSRF, en-têtes de sécurité, CORS restrictif | voir §2 et §3 | `security-headers.test.ts`, `hardening.test.ts`, e2e |
| Envois de fichiers | type déclaré **et** signature binaire vérifiés, 4 Mo par photo et 10 par envoi, noms régénérés, justificatifs dans un stockage privé | `product-photos.test.ts` |
| Transactions et concurrence | grand livre de stock (verrous de ligne, réservations, sans survente), verrou de version optimiste, commande et paiement transactionnels | `stock-ledger.test.ts`, `checkout-api.test.ts`, `payments-api.test.ts` |
| Webhooks idempotents, clés d'idempotence | signature HMAC vérifiée, événement rejoué sans effet ; `Idempotency-Key` sur la création de commande et de paiement | `payments-api.test.ts`, `checkout-api.test.ts` |
| Aucun secret dans le dépôt, `.env.example` complet | contrôle automatique (clés d'API, jetons, clés privées, URL avec mot de passe) ; chaque variable lue par le code est documentée | `repository-hygiene.test.ts` |
| IA : propose, l'administrateur confirme, journalisé | aucune écriture sans `confirm: true` ; la recherche et le résumé sont en lecture seule ; quotas | `ai-assistant.test.ts`, `ai-extensions.test.ts` |

**Dépendances (`npm audit`).**

- **Production : 0 vulnérabilité** pour la boutique et pour le back-office.
- Ce résultat suppose deux corrections faites à cette étape :
  - `nodemailer` passe de 7.0.13 à 10.3.1 (injections SMTP, lecture de fichiers, dénis de service) ;
  - la copie de `zod` embarquée par `@vercel/blob` est alignée sur la version du projet.

## 11. Risques résiduels et recommandations

| Sujet | Situation | Recommandation |
| --- | --- | --- |
| Outils de développement | `npm audit` signale encore vitest et tinypool (critique), esbuild via drizzle-kit, typescript-eslint (modérés). Ils ne sont **jamais déployés** et ne servent ni l'interface vitest ni un serveur de développement exposé | passer à vitest 5 dans une évolution dédiée (montée de version majeure) |
| CSP et scripts en ligne | autorisés pour l'hydratation des pages statiques | CSP à nonce si les pages passent toutes en rendu dynamique |
| Paiement réel | prestataire simulé ou manuel tant qu'aucun contrat n'est signé | brancher CinetPay en production avec ses clés, tester les webhooks réels en préproduction |
| E-mails | file d'attente opérationnelle, mais pas de SMTP en production | renseigner `SMTP_*` sur Vercel |
| Assistant IA | désactivé de fait sans clé | ajouter `ANTHROPIC_API_KEY` sur Vercel et ajuster les quotas |
| Surveillance | journal d'erreurs et journal d'audit en base | ajouter des alertes externes (journaux Vercel, disponibilité) |
| Sauvegardes | une branche Neon de sauvegarde avant chaque migration | vérifier la durée de restauration (PITR) du plan Neon |
| Juridique | — | faire valider en Côte d'Ivoire les CGV, la confidentialité, le KYC vendeur et le séquestre |

## 12. Tests de l'étape

| Fichier | Couverture |
| --- | --- |
| `tests/security-headers.test.ts` | directives, assouplissements limités, application aux deux applications |
| `tests/server/hardening.test.ts` | CSRF, CORS, API admin sans cookie, erreurs uniformes, tailles, injection SQL, tri non prévu, blocage de connexion, formulaires |
| `tests/server/indexes.test.ts` | clés étrangères, filtres et tris indexés |
| `tests/server/demo-seed.test.ts` | données de démonstration cohérentes et idempotentes |
| `tests/server/ai-extensions.test.ts` | génération en masse, validation groupée, résumé des ventes, recherche en langage naturel |
| `tests/server/openapi.test.ts` | documentation complète et sans référence cassée |
| `tests/db-diagram-sync.test.ts` | diagramme à jour |
| `tests/repository-hygiene.test.ts` | secrets et `.env.example` |
| `e2e/*.spec.ts` | parcours dans un navigateur, sur builds de production et PostgreSQL |

## Revue de sécurité de la vitrine (novembre 2026) : de l'accueil au paiement

Revue selon l'OWASP Top 10 et la logique de la norme PCI-DSS (la boutique ne traite aucune donnée de carte).

| Domaine | Constat | Mesure |
|---|---|---|
| Transport | HSTS déjà envoyé ; pas de redirection explicite en dehors de Vercel | Redirection permanente HTTP vers HTTPS dans `next.config.ts` (production, en-tête `x-forwarded-proto`) ; `upgrade-insecure-requests` dans la CSP |
| CSP | `img-src https:` laissait charger n'importe quelle image externe (exfiltration par balise image) | `img-src` limité à notre origine, `data:`, `blob:` et au stockage de fichiers Vercel ; reste `'unsafe-inline'` pour les scripts (hydratation Next.js des pages en cache : une CSP à jeton exigerait de rendre chaque page dynamique) |
| Isolation | Pas de `Cross-Origin-Resource-Policy` | `Cross-Origin-Resource-Policy: same-site`, `X-Permitted-Cross-Domain-Policies: none` (en plus de `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP) |
| Cookies | Administration : `HttpOnly`, `Secure`, `SameSite=Strict`. Auth.js : valeurs par défaut | `useSecureCookies` forcé en production pour Auth.js |
| CSRF | Server Actions : contrôle d'origine intégré à Next.js ; API : en-tête `Origin` contrôlé pour toute écriture depuis un navigateur ; cookie admin `SameSite=Strict` | Aucun changement nécessaire |
| Entrées | Validation Zod côté serveur ; requêtes Drizzle paramétrées (aucun `sql.raw` sur des données clients) | Nettoyage des saisies libres de la commande (`cleanText` : caractères de contrôle et chevrons retirés) ; React échappe l'affichage |
| Limites de débit | Connexion, inscription, formulaires, commande, recherche | Ajout du suivi de commande : 20 essais par heure et par IP |
| Données clients | Confirmation de commande ouverte par le seul numéro de commande | Lien signé (HMAC) obligatoire ; suivi en POST puis lien signé ; pages panier, commande, confirmation et suivi en `no-store` et `noindex` |
| Paiement | Aucun champ de carte ; paiement mobile money confirmé à la main ; passerelles (CinetPay, GeniusPay) par redirection | Test automatique : aucun champ de carte dans le formulaire ni dans le schéma de commande |
| Webhooks | Signature HMAC vérifiée en temps constant, horodatage contrôlé, doublons rejetés, signature invalide : 401 sans effet | Aucun changement nécessaire |
| Secrets | Seule `NEXT_PUBLIC_SITE_URL` est publique (adresse du site) ; journaux avec masquage des champs sensibles | Test d'hygiène existant (aucun secret dans le dépôt) |
| RGPD | Aucun bandeau d'information | Bandeau d'information sur le stockage strictement nécessaire (panier, favoris) ; aucun traceur publicitaire ni mesure d'audience. Si un outil d'audience est ajouté un jour, il faudra un vrai choix Accepter / Refuser avant son chargement |

### Configuration à faire hors du code

- Vercel : marquer `BLOB_READ_WRITE_TOKEN` comme variable « Sensitive » (elle est lisible depuis la ligne de commande) ; les variables de base de données fournies par l'intégration Neon sont gérées par l'intégration.
- Ne jamais définir `ALLOW_MOCK_PAYMENTS` en production.
- Renseigner `CINETPAY_SECRET_KEY` (ou le secret de la passerelle utilisée) avant d'ouvrir un paiement en ligne : sans lui, tous les webhooks sont refusés.
- Activer la double authentification sur les comptes GitHub, Vercel et Neon.
