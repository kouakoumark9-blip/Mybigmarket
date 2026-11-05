# Backend mybigmarket — Étape 8 : service client, assistant IA et multi-boutique

Ce document décrit ce que l'étape 8 ajoute. Les étapes précédentes sont décrites dans les documents 02 à 07 de ce dossier.

## 1. Mise à jour de la base de production

La migration `0020` s'applique comme les précédentes, après avoir créé une branche de sauvegarde dans Neon :

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrate-all.sql
```

Elle est additive : elle crée six tables et ne modifie aucune donnée existante.

| Table | Rôle |
| --- | --- |
| `support_tickets` | tickets du service client |
| `support_ticket_messages` | messages des tickets, notes internes comprises |
| `support_reply_templates` | modèles de réponse ; cinq sont livrés prêts à l'emploi |
| `ai_proposals` | propositions de l'assistant IA |
| `ai_usage` | journal de consommation de l'assistant |
| `employee_shops` | boutiques attribuées à chaque employé |

## 2. Service client

### D'où viennent les tickets

| Origine | Fonctionnement |
| --- | --- |
| Espace client | `/compte/support`, ou `POST /shop/support/tickets`. Le ticket est rattaché au compte, et à une commande de ce compte si le client en indique une. |
| Client sans compte | Il donne son e-mail et son nom. Il suit et complète sa demande par le **lien reçu par e-mail** (voir ci-dessous). |
| Formulaire de contact | Chaque message devient un ticket (paramètre `support.tickets_from_contact_form`). Un même envoi ne crée jamais deux tickets. |
| Équipe | `POST /admin/support/tickets`, pour une demande reçue par téléphone, WhatsApp ou e-mail. |

**Lien de suivi sans compte.** Le lien contient une clé dérivée de la référence du ticket et d'un secret serveur (`SUPPORT_LINK_SECRET`, à défaut `ADMIN_API_JWT_SECRET`). Aucune clé n'est stockée : changer le secret invalide les liens déjà envoyés.

### Cycle de vie

| Statut | Sens |
| --- | --- |
| `open` | à traiter par l'équipe |
| `awaiting_customer` | l'équipe a répondu |
| `resolved` | résolu |
| `closed` | clôturé |

**Ce qui change le statut.**

- **Première réponse de l'équipe.** Elle est horodatée (délai visé : `support.first_response_hours`, 24 h par défaut) et le ticket passe en `awaiting_customer`. S'il n'avait personne, il est attribué à l'auteur de la réponse.
- **Réponse du client.** Elle rouvre le ticket (retour à `open`).
- **Clôture automatique.** Chaque nuit, la tâche `support.auto_close` clôture les tickets résolus depuis plus de `support.auto_close_days` jours (7 par défaut).
- **Ticket clôturé.** Il ne se rouvre plus : le client ouvre une nouvelle demande.

**Échanges.**

- **Notes internes.** Elles ne sont jamais visibles du client, ni dans l'API boutique ni dans les e-mails.
- **Satisfaction.** Une fois le ticket résolu, le client donne une note de 1 à 5 et un commentaire facultatif.

### E-mails

Ils passent par la file des notifications (étape 6) et ne sont jamais envoyés deux fois.

| Modèle | Destinataire | Quand |
| --- | --- | --- |
| `support_ticket_received` | client | accusé de réception |
| `support_reply` | client | réponse de l'équipe, avec le lien de la conversation |
| `support_new_ticket` | équipe | nouveau ticket ; sauf formulaire de contact (déjà signalé par l'e-mail du formulaire) et ticket ouvert par l'équipe |

### Modèles de réponse

**Variables disponibles.** `{{customerName}}`, `{{ticketReference}}`, `{{ticketSubject}}`, `{{orderReference}}`, `{{agentName}}`, `{{storeName}}`.

**Préparation.** `POST /admin/support/tickets/:id/templates/:templateId/render` prépare le texte : les variables sont remplacées et celles qui manquent sont signalées. **Rien n'est envoyé.** L'employé relit, puis répond.

**Suivi.** Le nombre d'utilisations de chaque modèle est compté.

### API

Boutique :

| Méthode et chemin | Rôle |
| --- | --- |
| `GET /shop/support/tickets` | mes demandes (connecté) |
| `POST /shop/support/tickets` | ouvrir une demande (limite : 10 par heure) |
| `GET /shop/support/tickets/:reference?cle=` | conversation (compte propriétaire ou lien signé) |
| `POST /shop/support/tickets/:reference/messages` | répondre |
| `POST /shop/support/tickets/:reference/rating` | évaluer |

Administration :

| Méthode et chemin | Permission | Rôle |
| --- | --- | --- |
| `GET /admin/support/overview` | `support.read` | par statut, non assignés, en retard, temps moyen de première réponse, satisfaction (30 jours) |
| `GET /admin/support/tickets` | `support.read` | file : filtres de statut, priorité, catégorie, canal, assignation (`filter[assignedEmployeeId][null]=true` pour les non assignés) ; recherche ; `overdue=1` ; `mine=1` |
| `GET /admin/support/tickets/:id` | `support.read` | conversation complète, client et ses 5 dernières commandes |
| `POST /admin/support/tickets` | `support.create` | ouvrir pour un client |
| `PATCH /admin/support/tickets/:id` | `support.update` | statut, priorité, catégorie, étiquettes ; assignation : `support.assign` |
| `POST /admin/support/tickets/:id/messages` | `support.update` | réponse (`internal: true` pour une note), statut choisi, modèle utilisé |
| `/admin/support/templates` (CRUD) | `support.read`, `support.update`, `support.delete` | modèles de réponse |

Le back-office conserve aussi son écran existant des conversations acheteur–vendeur.

## 3. Assistant IA

### Principe : il propose, l'employé confirme, l'action est journalisée

L'assistant appelle Claude (API Anthropic). **La clé ne vit que dans `ANTHROPIC_API_KEY`** : elle n'est jamais enregistrée ni renvoyée.

**Ce que le modèle peut faire.** Il n'a ni outil, ni accès à la base, ni droit d'écriture. Il ne rend qu'un objet JSON conforme à un schéma (sorties structurées), revalidé ensuite avec les règles du catalogue.

**Propositions disponibles.**

| Proposition | Contenu | Permissions |
| --- | --- | --- |
| Contenu produit | titre, résumé, description, titre SEO, meta description, étiquettes | `ai.use` + `catalog.products.read` |
| Réponse à un ticket | brouillon, statut suggéré, confiance, informations manquantes | `ai.use` + `support.read` |

**Livrable : une proposition n'est jamais appliquée sans confirmation.**

1. **Proposer.** `POST /admin/ai/proposals/…` n'écrit que la proposition et l'état de la cible à cet instant (version du produit, textes actuels). Le produit n'est pas modifié ; le client ne reçoit rien.
2. **Appliquer.** `POST /admin/ai/proposals/:id/apply` exige les quatre conditions suivantes :
   - **`confirm: true`**, littéralement : toute autre valeur répond 400 ;
   - le droit sur la cible : `catalog.products.update` ou `support.update` ;
   - une cible **inchangée depuis la proposition**, sinon 409 : la proposition n'écrase jamais le travail d'un collègue ;
   - une proposition encore en attente : appliquée, refusée ou expirée, elle répond 409. Une seule application est possible, même avec deux clics simultanés.

   **Ce que l'employé peut choisir.** Il choisit les champs (`fields`) et peut retoucher les valeurs (`edits`). Les retouches sont validées comme une saisie manuelle, et seuls les champs prévus sont acceptés : le prix, par exemple, est refusé.

   **Comment c'est appliqué.** L'application passe par les services habituels : verrou de version, audit, événements, e-mail au client pour une réponse.
3. **Refuser.** `POST /admin/ai/proposals/:id/reject` enregistre la décision, avec une note facultative.
4. **Journal.** L'audit enregistre `ai.proposal_created`, `ai.proposal_applied` (avant et après, retouches indiquées) et `ai.proposal_rejected`. Une réponse envoyée garde le lien vers sa proposition. La tâche `ai.expire_proposals` marque expirées les propositions non décidées (`ai.proposal_ttl_hours`, 72 h).

### Données envoyées au modèle et sécurité

- **Ce qui est envoyé.**
  - Produit : son seul contenu.
  - Ticket : le prénom du client, les messages et un résumé de la commande (référence, statut, dates, suivi). **Jamais l'e-mail ni le téléphone.**
- **Données, pas consignes.** Les consignes du modèle traitent les textes du produit et les messages du client comme des données (protection contre l'injection d'instructions). Elles lui interdisent d'inventer une caractéristique, un délai, un remboursement ou un geste commercial. En dernier ressort, l'employé relit toujours.
- **Refus de sécurité.** Le fournisseur peut décliner une demande. Le repli automatique est alors activé (`fallbacks: "default"`) ; s'il échoue aussi, l'API répond 422 avec un message clair.

### Modèle, quotas et coûts

| Paramètre | Rôle | Défaut |
| --- | --- | --- |
| `ai.enabled` | activer ou désactiver l'assistant | activé |
| `ai.model` | modèle utilisé | `claude-opus-5-5` |
| `ai.daily_requests_per_employee` | propositions par employé et par jour | 30 |
| `ai.monthly_token_budget` | budget mensuel de jetons par boutique | 3 000 000 |
| `ai.proposal_ttl_hours` | durée de validité d'une proposition | 72 |

**Dépassement de quota.** L'API répond 429 avec un message clair, et le dépassement est journalisé.

**Limite de débit.** 10 propositions par minute et par employé.

**Effort du modèle.** Il est réglé par usage : `medium` pour le contenu produit, `low` pour les réponses du service client.

| Méthode et chemin | Rôle |
| --- | --- |
| `GET /admin/ai/status` | disponibilité, modèle, quotas restants |
| `POST /admin/ai/proposals/product-content` | `productId`, `fields`, `instructions`, `language` |
| `POST /admin/ai/proposals/support-reply` | `ticketId`, `instructions` |
| `GET /admin/ai/proposals`, `GET /admin/ai/proposals/:id` | propositions (valeurs actuelles et proposées) |
| `POST /admin/ai/proposals/:id/apply`, `/reject` | décision |
| `GET /admin/ai/usage` | consommation du mois (toute l'équipe avec `ai.manage`, sinon la mienne) |

## 4. Multi-boutique

### Contexte boutique

**Choix de la boutique.** Dans cet ordre : l'en-tête `X-Shop-Code`, sinon le domaine de la requête, sinon la boutique par défaut.

**Contrôle d'accès côté administration.** Il est fait à chaque requête :

| Acteur | Boutiques accessibles |
| --- | --- |
| SuperAdmin, ou employé avec `shops.manage` | toutes |
| Autre employé | ses boutiques attribuées ; sans attribution, la boutique par défaut |
| Clé d'API | sa propre boutique |

Une boutique non autorisée répond 403 avec son code.

**Propre à chaque boutique** :
- les paramètres ;
- les tickets et les modèles de réponse ;
- les propositions et les quotas de l'assistant ;
- les imports ;
- les statistiques ;
- les entrepôts, les prix spécifiques et les règles de prix.

**Commun à la place de marché** : le catalogue des vendeurs et les commandes.

### API

| Méthode et chemin | Permission | Rôle |
| --- | --- | --- |
| `GET /admin/shops` | `shops.read` | boutiques accessibles et boutique de la requête |
| `POST /admin/shops` | `shops.manage` | créer ; `copySettingsFrom` recopie les paramètres d'une autre boutique (le nom est remplacé) |
| `PATCH /admin/shops/:id` | `shops.manage` | nom, domaine, activation, boutique par défaut |
| `GET/PUT /admin/shops/:id/employees` | `shops.manage` | attribution des employés |

**Boutique par défaut.** Elle ne peut pas être désactivée. On en désigne une autre, et l'ancienne perd ce rôle automatiquement.

**Journal.** Création, modification et attributions sont journalisées.

## 5. Variables d'environnement

| Variable | Rôle |
| --- | --- |
| `ANTHROPIC_API_KEY` | assistant IA (facultatif) ; sans elle, l'assistant répond 503 « non configuré » |
| `SUPPORT_LINK_SECRET` | facultatif ; secret des liens de suivi des clients sans compte (sinon `ADMIN_API_JWT_SECRET`) |

## 6. Tests

| Fichier | Couverture |
| --- | --- |
| `tests/server/ai-assistant.test.ts` | **livrable** : proposition sans effet ; application refusée sans `confirm: true`, après refus, après expiration, sur produit modifié, deux fois ; retouches validées et champs limités ; réponse envoyée seulement après confirmation ; données minimales envoyées ; droits ; quotas ; limite de débit ; refus du modèle ; assistant non configuré |
| `tests/server/support-api.test.ts` | demandes avec ou sans compte, formulaire de contact, notes internes invisibles, e-mails, réouverture, satisfaction, clôture automatique, assignation, retards, modèles de réponse |
| `tests/server/shops-api.test.ts` | création avec recopie des paramètres, contexte par en-tête et par domaine, paramètres et tickets propres à chaque boutique, accès des employés, boutique par défaut protégée |

Le modèle est simulé dans les tests : aucun appel réel, aucun coût.
