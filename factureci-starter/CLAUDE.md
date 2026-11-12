# FactureCI

SaaS de facturation pour PME, artisans et freelances de Côte d'Ivoire (puis Afrique de l'Ouest). Mobile-first, PWA, en français, en FCFA. Porté par Krea Ecom.

## Comment travailler sur ce projet

1. Lis `docs/PROMPTS.md`. Il contient 4 prompts à exécuter dans l'ordre : fondations, documents, tableaux de bord, abonnement/PWA/déploiement.
2. Exécute un prompt à la fois, teste, puis passe au suivant. Commence par le Prompt 1.
3. Le fichier `prototype/index.html` est le prototype validé. Ouvre-le dans un navigateur : il sert de référence pour les écrans, les textes et les règles de calcul. Ne le modifie pas.

## Stack imposée

Next.js (App Router) + TypeScript + Tailwind, Neon (PostgreSQL) avec Drizzle, Auth.js (téléphone + mot de passe), zod, Vercel, dépôt GitHub. Plans gratuits au départ.

## Règles à respecter partout

- Français partout. Montants : `60 000 FCFA`, sans décimales. Dates : jj/mm/aaaa. Fuseau : Africa/Abidjan.
- Toute requête filtre par `user_id`. Aucun accès aux données d'un autre utilisateur.
- Calculs : sous-total, remise %, TVA (0 ou 18 %), total. Tranches de 1 à 6 : acompte saisi, reste réparti à parts égales arrondies à 100 FCFA vers le bas, la dernière tranche absorbe la différence. Exemple : 60 000 avec acompte 20 000 en 4 tranches donne 20 000 / 13 300 / 13 300 / 13 400.
- Trois types de documents : Facture (FAC), Devis (DEV), Bon de livraison (BL, sans prix). Numérotation FAC-2026-001, par utilisateur, type et année, dans une transaction.
- Pas d'API WhatsApp ni SMS payante : liens `wa.me` (préfixe 225 si le numéro compte 10 chiffres), `sms:` et `mailto:`.
- Paiement de l'abonnement sans API : lien Wave, puis validation manuelle par l'admin.
- Design : fond #F5F8F4, vert #0E6B43, orange #F77F00, police Bricolage Grotesque, boutons d'au moins 48 px, mode sombre automatique.

## Définitions du tableau de bord

- Facturé : total des factures non annulées émises sur la période.
- Encaissé : somme des tranches dont `paid_at` tombe dans la période.
- À encaisser : total des factures non annulées moins les tranches payées.
- En retard : tranches non payées dont l'échéance est dépassée.
- Les devis et les bons de livraison ne comptent jamais dans le chiffre d'affaires.

## Avant de dire qu'une étape est finie

Lance les tests unitaires (calculs, tranches, montant en lettres), démarre l'application en local et vérifie la checklist à la fin de `docs/PROMPTS.md`.
