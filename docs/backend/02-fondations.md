# Backend mybigmarket — Étape 2 : fondations

Ce document décrit ce qui est en place après l'étape 2 et comment l'utiliser.
L'audit et le plan d'ensemble sont dans [01-audit-et-plan.md](./01-audit-et-plan.md).

## 1. Mettre la base de production à jour (à faire avant tout)

La base Neon de production est restée avant la migration `0013` : `/api/health` répond `503 schema`.
`migrate-all.sql` applique maintenant les migrations manquantes, que la base ait été migrée avec ce fichier ou avec `npm run db:migrate`. Il ne rejoue rien de ce qui est déjà passé. Ce scénario est vérifié automatiquement par `tests/migrations-apply.test.ts`.

1. **Sauvegarde** : dans Neon, créer une branche de la base de production (*Branches → Create branch*), à garder tant que tout n'est pas vérifié.
2. **Application**, depuis un poste de confiance :

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
   ```

   (ou copier le fichier dans le *SQL Editor* de Neon). La dernière ligne affiche le nombre d'enregistrements de migration : au moins **15**, et parfois plus, car une migration peut en produire plusieurs.
3. **Contrôle** : `https://mybigmarket.vercel.app/api/health` doit répondre `200 operationnel`.

La migration `0014` ne supprime aucune donnée. Elle ajoute des tables (`shops`, `domain_events`, `rate_limit_buckets`, `idempotency_keys`) et des colonnes facultatives. Elle rattache aussi les paramètres existants à la boutique par défaut.

## 2. Variables d'environnement à ajouter sur Vercel (projet `mybigmarket`)

| Variable | Rôle | Obligatoire |
|---|---|---|
| `ADMIN_API_JWT_SECRET` | Signature des jetons de l'API admin (`openssl rand -base64 48`) | Oui, pour activer `/api/v1/admin` |
| `ADMIN_TOTP_ENCRYPTION_KEY` | Même valeur que sur le projet `l'ancien projet back-office (supprimé)` (double authentification) | Oui si des employés ont activé le TOTP |
| `ADMIN_CORS_ALLOWED_ORIGINS` | `https://l'ancien projet back-office (supprimé).vercel.app` | Recommandé |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Limitation de débit dans Redis au lieu de PostgreSQL | Non |

## 3. L'API en bref

- Spécification complète : `GET /api/v1/openapi.json` (OpenAPI 3.1, générée depuis le code).
- Deux surfaces : `/api/v1/admin/…` (jeton employé ou clé d'API) et `/api/v1/shop/…` (session client).
- Erreurs : `{ "error": { "code", "message", "details", "requestId" } }`, avec les codes `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `BUSINESS_RULE` 422, `RATE_LIMITED` 429 (+ `Retry-After`).
- Listes : `?page=1&limit=20&sort=-createdAt,email&filter[status][in]=active,locked&filter[createdAt][gte]=2026-01-01&q=texte`. Opérateurs : `eq` (défaut), `ne`, `in`, `gt`, `gte`, `lt`, `lte`, `like`, `null`. Un champ non déclaré est refusé.
- Créations sensibles : en-tête `Idempotency-Key`. La même requête rejouée renvoie la même réponse, sans second effet.

### Authentification de l'équipe

```bash
curl -X POST https://mybigmarket.vercel.app/api/v1/admin/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@exemple.ci","password":"…","totpCode":"123456"}'
```

```bash
curl https://mybigmarket.vercel.app/api/v1/admin/employees?limit=10 \
  -H "authorization: Bearer $ACCESS_TOKEN"
```

- **Jeton d'accès** : il dure 10 minutes. Il est invalidé si le mot de passe change ou si la session est révoquée.
- **Jeton de rafraîchissement** : il dure 30 jours et ne sert qu'une fois (`POST /admin/auth/refresh`). Présenter un jeton déjà utilisé révoque toute la session : c'est le signe d'un vol.
- **Protections** : mêmes règles que le back-office. Le compte est verrouillé après 6 échecs en 15 minutes, et l'API refuse au-delà de 18 échecs par adresse IP. Le TOTP est exigé s'il est activé.
- **Mots de passe** : ils sont hachés en **argon2id**. Les anciens hashes bcrypt restent valides et sont convertis à la connexion suivante, côté boutique comme côté back-office.

### Clés d'API (intégrations)

`POST /admin/api-keys` avec `{ "label": "ERP", "scopes": ["orders.read"] }` renvoie `secret` **une seule fois** (`mbm_…`), à utiliser comme `Authorization: Bearer mbm_…`. Une clé ne peut pas recevoir une permission que son créateur n'a pas.

## 4. Équipe et permissions

Une permission s'écrit `ressource.action`, par exemple `catalog.products.update`. La matrice complète est disponible via `GET /admin/permissions`. Deux règles s'appliquent :
- `ressource.manage` accorde toutes les actions de la ressource ;
- une action d'écriture accorde aussi la lecture de la ressource.

Les 36 codes utilisés par le back-office sont conservés.

| Profil (code) | Accès |
|---|---|
| SuperAdmin (`super_admin`) | Tout, y compris les permissions ajoutées plus tard |
| Gestionnaire (`manager`) | Catalogue, prix, stocks, commandes, clients, marketing, SEO, statistiques. Ni équipe ni paramètres système |
| Gestionnaire catalogue / commandes | Profils historiques, inchangés |
| Logisticien (`logistician`) | Commandes, stocks, transport, retours |
| Support (`customer_service`) | Clients, conversations, tickets, retours, litiges |
| Lecture seule (`read_only`) | Toutes les actions `read`, aucune modification |

Garde-fous : on ne peut ni désactiver, ni supprimer, ni changer le rôle de son propre compte. Le dernier SuperAdmin actif est protégé, et les permissions du SuperAdmin ne sont pas modifiables.

## 5. Paramètres, audit, événements, modules

- **Paramètres** (`GET/PATCH /admin/settings`) : 33 clés typées, réparties en groupes (boutique, commandes, catalogue, clients, e-mail, SEO, sécurité). Chaque valeur est validée, et une écriture invalide est entièrement refusée. Les paramètres sont stockés par boutique et mis en cache 30 s. `GET /shop/settings` expose les seules valeurs publiques.
- **Audit** (`GET /admin/audit-logs`) : chaque modification enregistre qui, quoi et quand, avec l'état avant/après, les champs modifiés, l'adresse IP et l'identifiant de requête. Le journal est écrit dans la même transaction que la modification. Les secrets sont masqués.
- **Événements** : ils sont écrits dans `domain_events` dans la même transaction que la donnée (outbox), puis distribués juste après la réponse. Ils passent aussi aux hooks historiques (`lib/hooks.ts`). En cas d'échec, l'événement est retenté 5 fois avec une attente croissante ; un abonné en panne ne bloque jamais une requête. Les événements en attente se consultent via `GET /admin/events`, et `POST /admin/events/dispatch` les distribue sans attendre. Filet de sécurité quotidien : `/api/cron/dispatch-events`.
- **Modules** (`GET/PATCH /admin/modules`) : un module déclare sa configuration, ses abonnements, ses routes et ses migrations. On l'active et on le configure sans redéploiement, et les secrets de configuration sont masqués à la lecture. Premier module livré : **Webhooks sortants**, qui envoie les événements choisis à une URL HTTPS, signés en HMAC-SHA256 (`x-mbm-signature: sha256=…` sur `timestamp.body`).

## 6. Multi-boutique (fondation)

La table `shops` contient la boutique par défaut (`00000000-0000-4000-8000-000000000001`). Chaque requête résout sa boutique : en-tête `X-Shop-Code`, puis domaine, puis boutique par défaut. Les paramètres, l'audit, les événements et les clés d'API portent déjà `shopId`.

## 7. Tests

| Fichier | Couverture |
|---|---|
| `tests/server/core.test.ts` | 28 tests unitaires : erreurs, listes, permissions, mots de passe, jetons, limites de débit, audit, paramètres, routeur, webhooks |
| `tests/server/admin-api.test.ts` | 20 tests d'intégration sur PostgreSQL réel (PGlite), à travers tout le pipeline HTTP |
| `tests/migrations-apply.test.ts` | 4 scénarios d'application réelle des migrations |
| `tests/auth-copies-sync.test.ts` | Les copies d'authentification du back-office restent identiques |
