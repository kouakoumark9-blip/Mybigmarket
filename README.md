# mybigmarket

> **Nom choisi : mybigmarket.** La disponibilité de la marque et du domaine reste à vérifier avant toute mise en ligne publique. — marketplace Chine → Côte d’Ivoire

**Ce projet n’utilise pas PrestaShop.** C’est une application web Next.js/TypeScript conçue pour GitHub, Vercel et PostgreSQL Neon. L’interface reprend des conventions générales de découverte B2B visibles sur Alibaba.com (recherche, catégories, offres, devis) et de marketplace, sans reprendre logos, textes, code ni visuels propriétaires.

> Prototype/MVP en cours : le catalogue, l’authentification, les rôles, les formulaires vendeur, la modération, la création de commandes par vendeur, le ledger, les webhooks mock et les pages principales sont présents. **Le mock ne débite pas d’argent et le ledger ne constitue pas un séquestre bancaire.** Le PSP réel, le partage du paiement et le versement vendeur doivent être branchés avant toute vente.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Neon PostgreSQL + Drizzle ORM, schéma et migrations dans `lib/db/schema.ts` et `drizzle/`
- Auth.js Credentials (boutique) et jetons employés à rotation (API d'administration) ; mots de passe hachés avec argon2id (anciens hachages bcrypt ré-hachés à la connexion) ; rôles et permissions par module
- Tests : Vitest + PostgreSQL embarqué (PGlite) pour l'unitaire et l'intégration, Playwright sur builds de production et PostgreSQL 16 pour le bout en bout
- Vercel Blob : images produit publiques, justificatifs vendeurs en stockage privé
- Interface française, FCFA/XOF, responsive/mobile-first; association typographique Inter (texte) + Manrope (titres), auto-hébergées sous licence SIL OFL; aucune favicon

## Couleurs du site

Toutes les couleurs sont regroupées dans `app/theme.css` (orange `#ff8000` et noir). `globals.css` et les composants n'utilisent que des variables `var(--color-*)` ou les utilitaires Tailwind correspondants (`bg-primary`, `text-text-muted`, `border-border`…). Pour ajuster une couleur, il suffit de la modifier dans `theme.css`.

## Backend et API REST v1

Le backend est organisé par domaine dans `server/` (route → service → repository) et exposé sous `/api/v1` : `/api/v1/admin` pour le back-office (jetons employé ou clés d'API, permissions par rôle) et `/api/v1/shop` pour la boutique. La spécification OpenAPI est servie sur `/api/v1/openapi.json`. La documentation est dans `docs/backend/` :

- `01-audit-et-plan.md` : audit et plan ;
- `02-fondations.md` : fondations, mise à jour de la base de production, variables d'environnement ;
- `03-catalogue-prix-stocks.md` : catalogue, prix, promotions, bons, entrepôts et grand livre de stock ;
- `04-clients-panier-commandes.md` : panier serveur, passage de commande, espace client, commandes, factures et avoirs, clients et groupes, taxes et devises ;
- `05-livraison-paiement.md` : paiement (intentions, notifications signées et idempotentes, journal, virement, paiement à la livraison, CinetPay, remboursements) et livraison (devis, transporteur au passage de commande, points relais, lots de groupage, suivi).
- `06-communication-cms-seo-recherche.md` : notifications (file d'e-mails sans doublon reliée aux événements, modèles personnalisables, WhatsApp), CMS (pages à blocs sans HTML libre, menus, formulaires, bannières), redirections 301/302 et recherche (plein texte sans accents, fautes de frappe, facettes, meilleures ventes, suggestions).
- `07-import-export-stats-journaux.md` : imports CSV ligne par ligne (simulation sans écriture, rapport par ligne, lots reprenables), exports réimportables, statistiques pré-calculées, journal des erreurs et tâches planifiées.
- `08-service-client-ia-multiboutique.md` : service client (tickets, notes internes, modèles de réponse, lien de suivi sans compte), assistant IA (propositions jamais appliquées sans confirmation, journalisées, avec quotas) et multi-boutique (accès des employés par boutique).
- `09-durcissement-et-audit.md` : en-têtes de sécurité, CSRF et CORS, limites de débit, revue des index, données de démonstration, tests de bout en bout, compléments de l'assistant IA et **audit de sécurité point par point**.
- `schema-base-de-donnees.md` : diagramme de la base (136 tables, un diagramme Mermaid par domaine), généré par `npm run docs:db`.

Toute variation de stock passe par `lib/stock-ledger.ts` (réservations tracées, mouvements avant/après, sans survente).

## Pages et fonctionnalités

- `/` : accueil de découverte inspiré des marketplaces B2B, catégories et deux parcours : précommande groupée et achat en gros
- `/produits` et `/produits/[slug]` : recherche/filtres, textes éditoriaux de démonstration répartis sur les 3 rayons (environ 850 mots) et les 20 produits (environ 2 200 mots), quantité minimale, délai, ajout panier, devis de gros et bouton de contact intégré. Les descriptions réellement saisies par un vendeur restent prioritaires sur les textes de démo.
- `/messages` et `/messages/[id]` : boîte de réception et conversations privées entre acheteurs et vendeurs, rattachées à un produit; authentification et Neon requis pour la synchronisation inter-comptes. Sans Neon, l’aperçu conserve uniquement des notes locales au navigateur et ne les transmet pas.
- `/demande-de-devis` et `/compte/demandes` : demandes de devis/sourcing persistées dans Neon quand la base est configurée; les devis produit apparaissent dans l’inbox vendeur, ouvrent une conversation intégrée et sont modérables dans `/admin`. Sans Neon, le parcours standard reste une simulation `localStorage` non transmise.
- `/demo-backend` : sandbox séparée pour examiner les flux acheteur/vendeur/admin sans compte ni Neon. Elle simule demandes, statuts, messages et réglages de vitrine, avec un panneau d’analytics exemple; l’API `/api/demo-backend/*` utilise des données fictives en mémoire, uniquement hors production, réinitialisées au redémarrage.
- `/vendeur/boutique` et `/boutiques/[slug]` : réglages de la vitrine publique du vendeur et page catalogue partageable; le modèle garde mybigmarket comme marketplace centrale.
- `/panier` et `/checkout` : panier navigateur; sans Neon, création de commandes simulées locales; avec Neon, une vraie commande applicative par vendeur et paiement mock en attente
- `/connexion`, `/inscription` : Auth.js + Neon
- `/compte/commandes` et `/compte/commandes/[id]` : suivi authentifié avec Neon ou timeline locale de démonstration sans base
- `/vendeur` : demande de vérification et tableau de bord vendeur
- `/vendeur/produits`, `/vendeur/commandes`, `/vendeur/demandes`, `/vendeur/boutique`, `/vendeur/statistiques`, `/vendeur/portefeuille` : catalogue, commandes, inbox devis, vitrine, statistiques et portefeuille
- `/admin` : validation des vendeurs/produits, transitions de commande, ledger, audit des actions sensibles
- `/api/webhooks/payment` : webhook HMAC mock idempotent; crée un ledger `blocked` après confirmation
- `/api/private-documents/[...pathname]` : téléchargement de justificatifs privés, limité au propriétaire et à l’admin
- `/sitemap.xml`, `/robots.txt`, métadonnées et Product JSON-LD

Sans `DATABASE_URL`, le catalogue, panier, commandes simulées et demandes de devis fonctionnent côté navigateur via `localStorage`; ils ne sont ni transmis à un vendeur ni synchronisés entre appareils. L’authentification, la persistance partagée, les pages vendeur/admin, la messagerie interne et l’upload Blob nécessitent les services configurés. Aucun paiement réel n’est activé.

## Structure

```text
mybigmarket/
├── actions/                 # actions serveur de la boutique (connexion, commande, vendeur, support…)
├── app/                     # pages App Router, API v1 (/api/v1/[...path]), webhooks, tâches planifiées
├── components/              # composants de la boutique
├── server/
│   ├── core/                # HTTP (routes, erreurs, listes, OpenAPI, CORS), auth, permissions, audit,
│   │                        # événements, paramètres, limites de débit, idempotence, boutique, tâches
│   ├── modules/             # un dossier par domaine : routes → service (catalogue, stock, commandes,
│   │                        # paiements, livraison, CMS, recherche, support, IA, boutiques, démo…)
│   └── api/registry.ts      # toutes les routes de l'API v1
├── lib/db/schema.ts         # schéma Drizzle (source unique) ; drizzle/ : migrations
├── adminnew/                # back-office (application Next.js séparée, consomme /api/v1/admin)
├── tests/                   # Vitest : unitaire et intégration sur PostgreSQL embarqué
├── e2e/                     # Playwright : parcours dans un navigateur
├── scripts/                 # migrate-all.sql, diagramme de la base, préparation des tests e2e
├── docs/backend/            # documentation par étape, audit, diagramme
└── .env.example             # toutes les variables d'environnement, sans aucun secret
```

## Démarrer en local

Pré-requis : Node.js **20.9+** (22 recommandé) et npm.

```bash
cd mybigmarket
npm install
cp .env.example .env.local
```

Créez une base de développement Neon, ajoutez son URL pooled à `DATABASE_URL`, générez `AUTH_SECRET` et les secrets mock :

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # MOCK_WEBHOOK_SECRET
```

Puis, sur une base de développement ou staging dédiée :

```bash
npm run db:generate     # à refaire après modification du schéma Drizzle
npm run db:migrate      # applique les migrations à DATABASE_URL
npm run db:seed         # bootstrap du back office; exige SEED_SUPERADMIN_EMAIL et SEED_SUPERADMIN_PASSWORD
npm run dev
```

Le seed principal crée les rôles/permissions et un SuperAdmin avec mot de passe haché (argon2id). Le mot de passe doit être unique et comporter au moins 16 caractères; il n’est ni affiché ni réinitialisé lors d’une seconde exécution. Il ajoute quatre produits en **brouillon**, sans stock, et des tarifs avion/bateau d’exemple qui restent **désactivés**. Les métriques non vérifiées ne sont pas seedées comme des avis réels. N’exécutez pas une migration ou un seed sur la base de production sans sauvegarde, contrôle de `DATABASE_URL` et validation explicite.

`npm run db:seed:demo` (sandbox seulement, bloqué en production sans `ALLOW_DEMO_SEED=true`) ajoute l'ancien jeu marketplace et un **commerce de démonstration complet** créé par les services : arbre de catégories, produit à déclinaisons, pack, promotion, bon `BIENVENUE10`, 3 clients, 4 commandes à différents stades et un ticket. Il est idempotent et utilise un mot de passe démo partagé (`SEED_DEMO_PASSWORD`) : il ne doit pas servir à créer ou sécuriser un compte d’administration.

Une base PostgreSQL locale convient aussi : `DATABASE_URL=postgres://utilisateur@localhost:5432/mybigmarket`, puis `npx drizzle-kit migrate`.

## Tests

| Commande | Contenu |
| --- | --- |
| `npm test` | Vitest : règles métier, intégration de l'API v1 sur PostgreSQL embarqué (PGlite), sécurité, index, OpenAPI, diagramme, secrets |
| `npm run test:e2e` | Playwright : parcours client et back-office dans un navigateur |
| `npm run lint` · `npx tsc --noEmit` | qualité et types |

Pour lancer les tests de bout en bout en local, préparez une base dédiée, puis les deux applications :

```bash
npx drizzle-kit migrate && npm run db:seed:admin && npm run db:seed:demo
psql "$DATABASE_URL" -f scripts/e2e-prepare.sql
npm run build && npx next start -p 3000
```

Dans un autre terminal, construisez et lancez le back-office (sur le port 3002), puis les tests :

```bash
(cd adminnew && npm run build && ADMIN_API_BASE_URL=http://localhost:3000 npx next start -p 3002)
```

```bash
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… npm run test:e2e
```

La CI GitHub exécute trois tâches à chaque PR :

- boutique (lint, types, `drizzle-kit check`, tests, build) ;
- back-office (lint, types, build) ;
- bout en bout (PostgreSQL 16, seeds, builds de production, Playwright).

## Tester le webhook mock

En développement seulement, le checkout crée des commandes par vendeur et des paiements `pending`. Le mock ne débite rien. Pour simuler le webhook `paid`, récupérez `external_reference` et `amount_xof` depuis la table `payments` :

```bash
npm run payment:mock-webhook -- mock_REFERENCE 25000 http://localhost:3000
```

Le script signe l’événement avec `MOCK_WEBHOOK_SECRET`. Après validation HMAC, le webhook passe le paiement à `succeeded`, la commande à `paid_escrow` et crée un `escrow_entries.status = blocked`. En production, le mock refuse les opérations sauf activation explicite; **ne définissez pas `ALLOW_MOCK_PAYMENTS` sur le projet de production.**

## Déployer sur GitHub puis Vercel

1. Créez deux branches/bases Neon (développement/staging et production). Copiez l’URL PostgreSQL pooled avec SSL activé.
2. Créez deux magasins Vercel Blob : un **public** pour les photos produit, un **privé** pour les justificatifs KYC. Copiez leurs jetons dans `BLOB_PUBLIC_READ_WRITE_TOKEN` et `BLOB_PRIVATE_READ_WRITE_TOKEN`.
3. Le dépôt GitHub du projet est `https://github.com/kouakoumark9-blip/Mybigmarket.git`. Après avoir configuré vos identifiants GitHub, si le remote `origin` est absent, ajoutez-le puis poussez la branche `main` depuis la racine :

   ```bash
   git remote add origin https://github.com/kouakoumark9-blip/Mybigmarket.git
   git push -u origin main
   ```

4. Dans Vercel, importez le dépôt GitHub. Ce dépôt doit avoir `package.json` à sa racine; laissez **Root Directory** à `./` (valeur par défaut). Framework Preset : Next.js; Node.js : 22.
5. Ajoutez dans Vercel → Settings → Environment Variables : `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `AUTH_URL` (URL de production), `NEXT_PUBLIC_SITE_URL`, `PLATFORM_COMMISSION_BPS=800`, `CRON_SECRET` et les deux jetons Blob. **N’ajoutez pas `ALLOW_MOCK_PAYMENTS=true` en production.**
6. Avant le premier déploiement, appliquez les migrations depuis votre environnement sécurisé avec `DATABASE_URL` de la base ciblée :

   ```bash
   npm run db:migrate
   ```

   Pour le bootstrap du back office, exécutez `npm run db:seed` depuis un environnement contrôlé en fournissant `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_NAME` et `SEED_SUPERADMIN_PASSWORD`; vérifiez soigneusement `DATABASE_URL`. Le seed est bloqué en production sauf opt-in ponctuel `ALLOW_PRODUCTION_ADMIN_SEED=true`. Les modes de paiement et de transport seedés demeurent désactivés jusqu’à configuration et validation réelle.
7. Déployez. La CI GitHub (`.github/workflows/ci.yml`) lance `npm ci`, `npm run lint` et `npm run build` sur chaque push/PR.

Vercel relancera un déploiement automatique à chaque push sur `main`. Ne commitez jamais `.env.local`, tokens, mots de passe ni données d’identité.

### Back-office séparé

Le projet Vercel `mybigmarket-adminnew` est séparé de la boutique et utilise le même dépôt avec **Root Directory = `adminnew`**. Son URL Vercel par défaut est `https://mybigmarket-adminnew.vercel.app`. Le dépôt client ne contient aucun lien vers cet espace. Le portail admin applique `noindex,nofollow`, un `X-Robots-Tag`, un `robots.txt` bloquant et une authentification employé.

Dans les variables d’environnement du projet Vercel admin, configurez `DATABASE_URL` avec la même base Neon que la boutique. `AUTH_SECRET` et `ADMIN_TOTP_ENCRYPTION_KEY` sont déjà stockés comme secrets Vercel; ne les copiez pas dans le dépôt ni dans le chat. La base doit d’abord recevoir `npm run db:migrate`, puis `npm run db:seed` depuis un environnement contrôlé avec `SEED_SUPERADMIN_EMAIL` et `SEED_SUPERADMIN_PASSWORD`. Sans `DATABASE_URL`, l’écran de connexion est public mais aucune authentification ne peut réussir et aucun compte employé n’est créé.

## Commission et séquestre — limites importantes

La commission par défaut est `800` points de base (**8 %**) et peut être ajustée par `PLATFORM_COMMISSION_BPS` (borne applicative 0–20 %). Le webhook ajoute l’écriture ledger `blocked`; la livraison la rend `eligible`. L’admin peut préparer une demande de règlement ou remboursement, qui reste explicitement non exécutée tant qu’un PSP n’est pas relié.

Le module `MockPaymentProvider` n’accepte aucune carte réelle, n’appelle pas Orange/MTN/Wave et ne retient ni ne transfère des fonds. Un webhook signé ne donne pas à la plateforme la capacité légale de séquestre. N’annoncez pas cette fonctionnalité comme active avant l’accord du prestataire, les callbacks de transfert/remboursement et une validation juridique en Côte d’Ivoire.

## Vérifications effectuées

- `npm test` : 46 fichiers, 581 tests, tous verts. Ils couvrent les règles métier et l'intégration de l'API sur PostgreSQL embarqué, ainsi que la sécurité, les index, OpenAPI, le diagramme de la base et l'absence de secrets.
- `npm run test:e2e` : 4 scénarios verts. Ils tournent sur les builds de production des deux applications et PostgreSQL 16, avec la même séquence que la CI.
- `npm run lint`, `npx tsc --noEmit`, `npx drizzle-kit check`, builds de production : OK.
- `npm audit --omit=dev` : 0 vulnérabilité, pour la boutique comme pour le back-office.
- Base de production Neon : migrations appliquées après une branche de sauvegarde, et empreinte du schéma identique à la référence.

## À terminer avant lancement commercial

- **Paiement réel.** Contrat avec le prestataire (CinetPay ou équivalent), clés de production, tests des webhooks réels en préproduction, versement aux vendeurs.
- **E-mails.** Renseigner `SMTP_*` sur Vercel ; la file d'e-mails est prête. Ajouter `ANTHROPIC_API_KEY` pour activer l'assistant IA.
- **Logistique.** Frais de transitaire et de douane réels, assurance, preuves de livraison.
- **Juridique.** Validation en Côte d'Ivoire des CGV, de la confidentialité, du KYC vendeur et du séquestre. Le grand livre ne vaut pas séquestre bancaire.
- **Exploitation.** Alertes externes (erreurs, disponibilité), vérification de la restauration Neon, montée de version des outils de test (voir l'audit, §11).
