# mybigmarket

> **Nom choisi : mybigmarket.** La disponibilité de la marque et du domaine reste à vérifier avant toute mise en ligne publique. — marketplace Chine → Côte d’Ivoire

**Ce projet n’utilise pas PrestaShop.** C’est une application web Next.js/TypeScript conçue pour GitHub, Vercel et PostgreSQL Neon. L’interface reprend des conventions générales de découverte B2B visibles sur Alibaba.com (recherche, catégories, offres, devis) et de marketplace, sans reprendre logos, textes, code ni visuels propriétaires.

> Prototype/MVP en cours : le catalogue, l’authentification, les rôles, les formulaires vendeur, la modération, la création de commandes par vendeur, le ledger, les webhooks mock et les pages principales sont présents. **Le mock ne débite pas d’argent et le ledger ne constitue pas un séquestre bancaire.** Le PSP réel, le partage du paiement et le versement vendeur doivent être branchés avant toute vente.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Neon PostgreSQL + Drizzle ORM, schéma et migrations dans `lib/db/schema.ts` et `drizzle/`
- Auth.js Credentials, mots de passe hachés avec bcrypt, rôles `buyer`, `seller`, `admin`
- Vercel Blob : images produit publiques, justificatifs vendeurs en stockage privé
- Interface française, FCFA/XOF, responsive/mobile-first; association typographique Inter (texte) + Manrope (titres), auto-hébergées sous licence SIL OFL; aucune favicon

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
├── actions/                 # actions serveur auth, commandes, vendeur, admin et demandes de devis
├── app/                     # routes App Router, API, sitemap et robots
├── components/              # header, catalogue, panier, dashboard, formulaires
├── drizzle/                 # migrations PostgreSQL générées
├── lib/db/schema.ts         # enums, 23 tables et relations Drizzle
├── lib/db/seed.ts           # admin + 3 vendeurs + 3 catégories + 20 produits
├── lib/payments/provider.ts # PaymentProvider et implémentation Mock
└── .env.example
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

Le seed principal crée les rôles/permissions et un SuperAdmin avec mot de passe haché bcrypt. Le mot de passe doit être unique et comporter au moins 16 caractères; il n’est ni affiché ni réinitialisé lors d’une seconde exécution. Il ajoute quatre produits en **brouillon**, sans stock, et des tarifs avion/bateau d’exemple qui restent **désactivés**. Les métriques non vérifiées ne sont pas seedées comme des avis réels. N’exécutez pas une migration ou un seed sur la base de production sans sauvegarde, contrôle de `DATABASE_URL` et validation explicite.

L’ancien jeu de données marketplace est isolé derrière `npm run db:seed:demo`, sandbox seulement. Il utilise un mot de passe démo partagé et ne doit pas servir à créer ou sécuriser un compte d’administration.

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

## Vérifications effectuées dans ce workspace

- `npm run lint` : OK
- `npm run build` : OK (Next.js 16.3.6)
- Pages publiques de preview testées en HTTP : accueil, catalogue, fiche produit, vendeurs, guide — toutes répondent 200.
- Neon et Blob non configurés ici : les migrations distantes, uploads privés/publics et flux PSP devront être testés sur un projet de staging.

## À terminer avant lancement commercial

- Intégration contractuelle CinetPay/PayDunya (ou autre PSP), mobile money et carte; vérification webhook/fraude, remboursement et paiement vendeur.
- Calcul des frais transitaire/douane, lots réels Chine–Abidjan, assurance et preuves de livraison.
- Réservation/restauration de stock lors des commandes en attente/échec de paiement, politiques d’expiration et réconciliation.
- Téléversement de preuves de litige, avis après livraison, notifications email/SMS/WhatsApp, CGV et politique de confidentialité validées localement.
- Formulaire vendeur demande l’université/ville/WhatsApp et justificatifs privés; compléter les procédures légales KYC, rétention/suppression et accès interne.
- Tests E2E, rate limiting, anti-bruteforce, sauvegardes, alertes, monitoring et audit sécurité avant d’accepter de vrais clients.
