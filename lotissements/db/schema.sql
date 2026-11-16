-- Phase 1 : connexion, rôles, lotissements, lots, clients, journal d'audit.
-- Montants en FCFA (entiers). Idempotent : peut être rejoué.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            SERIAL PRIMARY KEY,
  nom           TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('admin','commercial','caissier','foncier')),
  mot_de_passe  TEXT NOT NULL,
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  cree_le       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lotissements (
  id               SERIAL PRIMARY KEY,
  nom              TEXT NOT NULL UNIQUE,
  localisation     TEXT NOT NULL DEFAULT '',
  superficie       INTEGER CHECK (superficie IS NULL OR superficie >= 0),   -- m²
  statut_juridique TEXT NOT NULL DEFAULT '',
  plan             TEXT,           -- clé du fichier dans l'espace privé (phase ultérieure)
  cree_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lots (
  id             SERIAL PRIMARY KEY,
  lotissement_id INTEGER NOT NULL REFERENCES lotissements(id) ON DELETE RESTRICT,
  numero         TEXT NOT NULL,
  ilot           TEXT NOT NULL DEFAULT '',
  superficie     INTEGER NOT NULL CHECK (superficie > 0),                   -- m²
  prix_m2        INTEGER CHECK (prix_m2 IS NULL OR prix_m2 >= 0),           -- FCFA
  prix_fixe      INTEGER CHECK (prix_fixe IS NULL OR prix_fixe >= 0),       -- FCFA
  statut         TEXT NOT NULL DEFAULT 'disponible'
                 CHECK (statut IN ('disponible','reserve','vendu','bloque')),
  observations   TEXT NOT NULL DEFAULT '',
  cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lots_un_seul_prix CHECK ((prix_m2 IS NULL) <> (prix_fixe IS NULL)),
  CONSTRAINT lots_numero_unique UNIQUE (lotissement_id, numero)
);
CREATE INDEX IF NOT EXISTS lots_lotissement_idx ON lots(lotissement_id);

CREATE TABLE IF NOT EXISTS clients (
  id                    SERIAL PRIMARY KEY,
  nom                   TEXT NOT NULL,
  prenoms               TEXT NOT NULL DEFAULT '',
  telephone             TEXT NOT NULL DEFAULT '',
  whatsapp              TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  adresse               TEXT NOT NULL DEFAULT '',
  profession            TEXT NOT NULL DEFAULT '',
  situation_matrimoniale TEXT NOT NULL DEFAULT '',
  contact_urgence       TEXT NOT NULL DEFAULT '',
  piece_identite_type   TEXT NOT NULL DEFAULT '',
  piece_identite_numero TEXT NOT NULL DEFAULT '',
  piece_identite_scan   TEXT,     -- clé du fichier dans l'espace privé (phase ultérieure)
  cree_par              INTEGER REFERENCES utilisateurs(id),
  cree_le               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_nom_idx ON clients(lower(nom));

CREATE TABLE IF NOT EXISTS journal_audit (
  id             BIGSERIAL PRIMARY KEY,
  utilisateur_id INTEGER REFERENCES utilisateurs(id),
  action         TEXT NOT NULL,
  entite         TEXT NOT NULL,
  entite_id      TEXT,
  details        JSONB,
  date           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_audit_date_idx ON journal_audit(date DESC);
