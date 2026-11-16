# Gestion de lotissements (logiciel de bureau)

Electron + React + TypeScript, base PostgreSQL (Neon). Cahier des charges v1.1 — **Phase 1** : connexion, rôles, lotissements, lots (liste, plan, import CSV), clients, utilisateurs, journal d'audit.

```bash
npm install
cp .env.example .env     # puis renseigner DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
export $(grep -v '^#' .env | xargs)
npm run db:migrate       # crée les tables
npm run db:seed:admin    # crée le premier administrateur
npm run dev              # lance le logiciel
npm test                 # tests unitaires
npm run dist:win         # installateur .exe (à lancer sous Windows)
```

En production, la chaîne de connexion se met dans `config.json` (`{"databaseUrl": "..."}`) dans le dossier de données du logiciel.

## Choix à valider
- Les droits sont appliqués dans le processus principal d'Electron (le poste ne reçoit jamais le droit de choisir son rôle) **et non par des rôles PostgreSQL** comme le cahier des charges le suggère : chaque poste se connecte à Neon avec le même compte technique. Un vrai cloisonnement base de données demande des rôles/RLS par utilisateur — à décider avant la phase 2.
- Écriture lotissements/lots : administrateur seul (le cahier des charges ne précise pas).
- Statuts Réservé/Vendu non modifiables à la main : ils seront posés par les réservations/ventes (phase 2).
- Scans (plan, pièce d'identité) : colonnes prêtes, stockage privé à faire.
