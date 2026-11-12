# FactureCI – Prompts complets

Krea Ecom · Novembre 2026

## Comment l'utiliser

1. Exécute les 4 prompts **dans l'ordre**, un à la fois. Teste le résultat après chacun avant de passer au suivant.
2. Si le travail s'arrête en route : « Continue exactement où tu t'es arrêté, fichier par fichier. »
3. Après le prompt 4, passe la checklist de test à la fin de ce document.

Le prototype validé (`prototype/index.html`) sert de modèle : mêmes écrans, mêmes règles de calcul, avec en plus les comptes, la base de données, le tableau de bord et l'abonnement.

---

## Prompt 1 – Fondations (stack, base de données, comptes)

```
Tu es un développeur full-stack senior. Tu construis FactureCI, un SaaS de facturation pour les PME, artisans et freelances de Côte d'Ivoire (puis Afrique de l'Ouest). L'application est mobile-first, installable (PWA), en français, en FCFA.

STACK IMPOSÉE
- Next.js (App Router) + TypeScript + Tailwind CSS
- Base de données : Neon (PostgreSQL) avec Drizzle ORM et migrations
- Authentification : Auth.js, connexion par numéro de téléphone + mot de passe (e-mail facultatif), mots de passe hachés (argon2 ou bcrypt)
- Validation de toutes les entrées serveur avec zod
- Déploiement : dépôt GitHub puis Vercel (plans gratuits au départ)
- Variables d'environnement : DATABASE_URL, AUTH_SECRET, ADMIN_PHONES (numéros admin séparés par des virgules), WAVE_LINK_PRO, WAVE_LINK_BUSINESS, APP_URL

RÈGLES GÉNÉRALES
- Français partout. Montants : 60 000 FCFA (espace comme séparateur, pas de décimales). Dates : jj/mm/aaaa. Fuseau : Africa/Abidjan.
- Chaque donnée appartient à un utilisateur : toute requête filtre par user_id. Aucun accès aux données d'un autre utilisateur.
- Design : fond #F5F8F4, vert #0E6B43 (actions principales), orange #F77F00 (accent), police Bricolage Grotesque, coins arrondis 12 px, boutons d'au moins 48 px de haut, mode sombre automatique. Pensé pour téléphone d'abord, puis adapté au bureau.
- Textes d'interface simples, avec des verbes d'action (« Enregistrer », « Envoyer sur WhatsApp »). Les erreurs disent quoi corriger.

BASE DE DONNÉES (crée le schéma Drizzle et les migrations)
- users : id, phone (unique), email (nullable), password_hash, name, role (user | admin), plan (free | pro | business), plan_expires_at, created_at
- companies : id, user_id, name, logo (image redimensionnée à 240 px max), rccm, tax_number (compte contribuable), address, phone, payment_numbers (JSON : Wave, Orange Money, MTN Money, Moov Money), default_note, created_at
- clients : id, user_id, name, phone, email, address, created_at
- documents : id, user_id, client_id, type (FAC | DEV | BL), number, status (draft | sent | partial | paid | overdue | cancelled | delivered), issue_date, due_date, discount_percent, vat_percent (0 ou 18), subtotal, discount_amount, vat_amount, total, note, payment_methods (liste), delivery_address, delivered_by, source_document_id (nullable), share_token (unique), created_at
- document_items : id, document_id, position, description, quantity, unit_price
- installments : id, document_id, position, label (Acompte, Tranche 2, Solde, Paiement comptant), amount, due_date, paid_at (nullable), method (nullable)
- payment_requests : id, user_id, plan, amount, reference, status (pending | validated | rejected), created_at, validated_at
- counters : user_id, type, year, last_number

NUMÉROTATION
Format TYPE-ANNÉE-000N (FAC-2026-001, DEV-2026-001, BL-2026-001). Un compteur par utilisateur, par type et par année, incrémenté dans une transaction pour éviter les doublons.

COMPTES
Pages : inscription, connexion, mot de passe oublié (réinitialisation par l'admin pour le moment), profil de l'entreprise (nom, logo, RCCM, compte contribuable, adresse, téléphone, numéros Mobile Money, note par défaut). Un utilisateur dont le téléphone figure dans ADMIN_PHONES reçoit le rôle admin.

LIVRABLE
Projet qui démarre en local avec un fichier .env.example, les migrations, un seed qui crée un compte admin, et un README court avec les commandes. Ne construis pas encore les documents ni le tableau de bord.
```

---

## Prompt 2 – Factures, devis et bons de livraison

```
Continue le projet FactureCI. Construis maintenant le module de documents. Il reprend exactement le parcours du prototype (prototype/index.html) : 3 écrans, très simple, pensé pour un téléphone.

TROIS TYPES DE DOCUMENTS
- Facture (FAC), Devis (DEV), Bon de livraison (BL). Choix du type au début. Le BL n'a ni prix, ni TVA, ni paiement.

PARCOURS EN 3 ÉTAPES
Étape 1 – Client : nom, WhatsApp, e-mail (facultatif), adresse de livraison (seulement pour le BL). Autocomplétion depuis le carnet de clients, avec création automatique du client s'il n'existe pas.
Étape 2 – Lignes : description, quantité, prix unitaire, bouton supprimer, bouton « Ajouter une ligne », trois modèles en un clic (Création de site web, Prestation de service, Vente de marchandises). Total mis à jour en direct.
Étape 3 – Conditions et paiement : remise en %, TVA (Non applicable ou 18 %), date d'échéance, note ou conditions, moyens de paiement acceptés, tranches, puis aperçu en direct et boutons d'action.

MOYENS DE PAIEMENT
Sélection multiple : Wave, Orange Money, MTN Money, Moov Money, Espèces, Virement, Chèque. Pour chaque Mobile Money choisi, un champ numéro, mémorisé dans le profil. Les moyens choisis s'affichent sur le document, dans le message WhatsApp et dans l'e-mail.

CALCULS
- sous-total = somme (quantité × prix)
- remise = arrondi(sous-total × remise %)
- TVA = arrondi((sous-total − remise) × TVA %)
- total = sous-total − remise + TVA

PAIEMENT EN TRANCHES
- Nombre de tranches de 1 à 6 (1 = paiement comptant, sans champ acompte).
- Premier versement (acompte) saisi par l'utilisateur. Le reste est réparti à parts égales arrondies à 100 FCFA vers le bas, et la dernière tranche absorbe la différence.
- Exemple : total 60 000, acompte 20 000, 4 tranches → 20 000 / 13 300 / 13 300 / 13 400.
- Chaque montant reste modifiable à la main, avec contrôle que la somme égale le total.
- Chaque tranche peut avoir une date d'échéance et se marque « payée » avec la date et le moyen utilisé.
- Statut de la facture calculé automatiquement : sent, partial, paid, ou overdue si une échéance est dépassée et non payée.

MONTANT EN LETTRES
Écris la phrase « Arrêté à la somme de : … francs CFA. » avec une fonction de conversion française testée. Cas à valider : 0 = zéro, 21 = vingt et un, 71 = soixante et onze, 80 = quatre-vingts, 81 = quatre-vingt-un, 100 = cent, 200 = deux cents, 201 = deux cent un, 1 000 = mille, 60 000 = soixante mille, 1 250 000 = un million deux cent cinquante mille.

APERÇU ET MODÈLE DE DOCUMENT
Logo, nom de l'entreprise, RCCM, numéro et date, client, tableau des lignes, sous-total, remise, TVA, total, montant en lettres, tranches, moyens de paiement, note, et deux zones de signature (« Le prestataire » et « Cachet et signature du client »). Le BL a ses propres zones : « Le livreur » et « Reçu par (nom, date, signature) ».

ACTIONS
- Télécharger le PDF (génération côté serveur avec @react-pdf/renderer, même mise en page que l'aperçu).
- Envoyer sur WhatsApp : lien https://wa.me/ avec message prérempli (montant, tranches, moyens de paiement). Si le numéro compte 10 chiffres, ajouter le préfixe 225.
- Envoyer par e-mail : pour l'instant lien mailto avec message prérempli. Prévois une couche d'envoi séparée pour brancher Resend plus tard avec le PDF en pièce jointe.
- Lien public de consultation /d/[share_token], en lecture seule, sans connexion, avec bouton « Télécharger le PDF ». Ce lien est celui envoyé au client.
- Dupliquer un document. Transformer un devis en facture. Créer un bon de livraison depuis une facture (mêmes articles, sans prix).
- Statuts et filtres dans la liste : recherche par client ou numéro, filtre par type et par statut.

QUALITÉ
Validation zod, messages d'erreur clairs, états de chargement, états vides avec un bouton d'action, accessibilité clavier, test unitaire pour les calculs, les tranches et le montant en lettres.
```

---

## Prompt 3 – Tableau de bord utilisateur et tableau de bord admin

```
Continue le projet FactureCI. Construis deux tableaux de bord avec Recharts. Garde la logique de calcul dans des fonctions serveur testées, pas dans les composants.

DÉFINITIONS (à respecter partout)
- Facturé = total des factures (FAC) non annulées émises sur la période.
- Encaissé = somme des tranches avec paid_at dans la période.
- À encaisser = total des factures non annulées moins les tranches payées.
- En retard = tranches non payées dont l'échéance est dépassée.
- Les devis et les bons de livraison ne comptent jamais dans le chiffre d'affaires.

TABLEAU DE BORD UTILISATEUR (/app)
Filtre de période en haut : Aujourd'hui, 7 jours, Ce mois, Mois dernier, Cette année, Personnalisé.
Boutons d'action rapide, toujours visibles : + Facture, + Devis, + Bon de livraison.
Cartes d'indicateurs :
1. Facturé
2. Encaissé
3. À encaisser
4. En retard (montant et nombre de factures)
5. Devis en attente (nombre) et taux de conversion devis → facture
6. Bons de livraison de la période
Graphiques :
- Barres : facturé et encaissé par mois sur 12 mois.
- Anneau : encaissé par moyen de paiement.
- Classement des 5 meilleurs clients par montant facturé.
Tableaux :
- « À encaisser cette semaine » : tranches dont l'échéance tombe dans les 7 jours, avec un bouton « Relancer sur WhatsApp » qui ouvre un message poli prérempli (nom du client, numéro de facture, montant de la tranche, moyens de paiement).
- « Factures en retard », triées par ancienneté, avec le même bouton de relance.
- « Derniers documents » avec statut coloré.
États vides : message clair et bouton « Créer ma première facture ».
Export CSV des documents et des paiements de la période, utile pour un comptable.
Sur téléphone : cartes en colonne, graphiques lisibles sans zoom, tableaux sous forme de cartes empilées.

TABLEAU DE BORD ADMIN (/admin, réservé au rôle admin)
- Indicateurs : utilisateurs inscrits, nouveaux cette semaine, actifs sur 30 jours (au moins un document créé), abonnés par plan, revenu mensuel récurrent (somme des plans payants actifs), taux de conversion gratuit → payant.
- Demandes de paiement en attente : tableau avec utilisateur, plan, montant, référence, date, et boutons « Valider » et « Rejeter ». Valider active le plan, fixe plan_expires_at à +30 jours (ou prolonge de 30 jours), et génère automatiquement une facture d'abonnement dans le compte de l'administrateur avec le moteur de documents.
- Liste des utilisateurs : recherche par nom ou téléphone, plan, date d'expiration, nombre de documents, boutons « Changer de plan », « Suspendre », « Réinitialiser le mot de passe ».
- Journal des actions administrateur (qui a validé quoi et quand).
```

---

## Prompt 4 – Abonnement, PWA, sécurité et déploiement

```
Continue le projet FactureCI. Termine avec l'abonnement, l'application installable, la sécurité et le déploiement.

PLANS
- Gratuit : 5 documents par mois, 1 utilisateur, PDF avec la mention « Créé avec FactureCI ».
- Pro à 4 900 FCFA par mois : documents illimités, logo, PDF sans mention, envoi par e-mail, tableau de bord complet, relances WhatsApp.
- Business à 9 900 FCFA par mois : tout le plan Pro, export CSV, carnet de clients illimité, jusqu'à 3 utilisateurs sur la même entreprise.
Le blocage se fait côté serveur : quand la limite du plan est atteinte, afficher une page claire « Passez au plan Pro » au lieu d'une erreur.

PAIEMENT SANS API (validation manuelle)
1. L'utilisateur ouvre « Mon abonnement », choisit un plan et clique sur « Payer avec Wave » : le lien WAVE_LINK_PRO ou WAVE_LINK_BUSINESS s'ouvre.
2. Après paiement, il revient dans l'application, saisit la référence ou le numéro qui a payé, et envoie : une payment_request en attente est créée.
3. Il voit « Paiement en cours de vérification ». L'admin valide dans /admin et le plan s'active.
4. L'utilisateur voit son plan et sa date d'expiration, avec un rappel 5 jours avant la fin. À l'expiration, retour automatique au plan Gratuit sans suppression des données.

NOTIFICATIONS SANS API
Aucune API WhatsApp ou SMS payante. Utilise des liens wa.me et sms: qui ouvrent l'application du téléphone avec le message prérempli (relance de tranche, confirmation de paiement, envoi du document).

PWA
manifest.webmanifest, icônes 192 et 512 px, service worker avec cache de l'interface, bannière « Installer l'application », page hors ligne claire, et mise en file des brouillons créés hors connexion pour les envoyer au retour du réseau.

SÉCURITÉ
Rate limiting sur la connexion et l'inscription, sessions sécurisées, aucune clé dans le code client, en-têtes de sécurité, vérification de propriété sur chaque ressource, échappement du contenu affiché, limite de taille du logo (2 Mo avant redimensionnement), vérification du type de fichier.

DÉPLOIEMENT
Guide pas à pas : créer le projet Neon et copier DATABASE_URL, pousser le code sur GitHub, importer le dépôt dans Vercel, renseigner toutes les variables d'environnement, lancer les migrations, créer le compte admin, tester en production.

LIVRABLE
Résume en fin de réponse les fichiers créés, les commandes à lancer, et la liste de ce qui reste à faire pour la version 2 : envoi d'e-mail avec PDF joint (Resend), paiement automatique, relances programmées.
```

---

## Checklist de test avant la mise en ligne

- Créer un compte, renseigner l'entreprise et ajouter un logo.
- Créer une facture de 60 000 FCFA, acompte 20 000, 4 tranches : vérifier 20 000 / 13 300 / 13 300 / 13 400.
- Ajouter une remise de 10 % et la TVA à 18 % : vérifier le total et le montant en lettres.
- Choisir Wave et Espèces comme moyens de paiement : vérifier l'affichage sur le PDF et dans WhatsApp.
- Choisir 1 tranche : vérifier que le champ acompte disparaît.
- Marquer une tranche payée : le statut passe à « partiel », puis à « payée » après la dernière.
- Créer un bon de livraison depuis une facture : pas de prix, deux zones de signature.
- Ouvrir le lien public /d/[token] sans être connecté.
- Créer 6 documents avec le plan Gratuit : le 6e doit être bloqué avec la page « Passez au plan Pro ».
- Faire une demande de paiement, la valider depuis /admin, vérifier le changement de plan.
- Vérifier qu'un utilisateur ne peut ouvrir aucun document d'un autre utilisateur.
- Installer l'application sur un téléphone et tester le mode hors ligne.
