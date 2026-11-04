#!/usr/bin/env node
/**
 * Construit `migrate-all.sql` : tout l'historique de migration dans un seul
 * fichier exécutable sans outillage Node.
 *
 * Pourquoi ce script existe
 * -------------------------
 * Le déploiement n'applique aucune migration : la CI ne vérifie que leur
 * syntaxe, et `drizzle-kit migrate` exige node_modules côté opérateur. Or il
 * faut pouvoir migrer Neon depuis n'importe où, y compris le SQL Editor, avec
 * une simple commande `psql`. Ce fichier est donc un livrable, pas un
 * artefact de debug : il doit être régénéré à chaque nouvelle migration.
 *
 * Deux contraintes PostgreSQL réelles sont encodées ici, découvertes en
 * exécutant réellement les migrations sur PostgreSQL 16 (choses que ni
 * `drizzle-kit check` ni pg-mem ne voient) :
 *
 *  1. `ALTER TYPE … ADD VALUE` est une commande utilitaire : elle ne peut pas
 *     être planifiée dans un bloc PL/pgSQL, d'où le passage par `EXECUTE`,
 *     et elle doit être seule dans sa transaction.
 *  2. Une clé étrangère vers une colonne non indexée de façon unique est
 *     refusée par PostgreSQL. Drizzle ne garantit pas l'ordre entre
 *     `ADD CONSTRAINT … FOREIGN KEY` et le `CREATE UNIQUE INDEX` correspondant.
 *
 * Le script est idempotent : chaque migration n'est rejouée que si son
 * empreinte n'est pas déjà dans `drizzle.__drizzle_migrations` (la table que
 * drizzle-kit lui-même utilise).
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(root, "drizzle");

const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) throw new Error("Aucune migration trouvée dans drizzle/.");

const ALTER_TYPE_ADD_VALUE = /^ALTER TYPE .* ADD VALUE .*;$/;
const fingerprint = (sql) => createHash("sha1").update(sql).digest("hex").slice(0, 10);

/** Découpe aux points de rupture Drizzle (jamais dans une chaîne). */
function statements(body) {
  return body
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Regroupe les instructions consécutives de même nature, pour isoler les
 * `ALTER TYPE … ADD VALUE` dans leur propre transaction.
 */
function groups(list) {
  const out = [];
  for (const sql of list) {
    const mode = ALTER_TYPE_ADD_VALUE.test(sql) ? "alter-type-add-value" : "plain";
    const last = out.at(-1);
    if (last && last.mode === mode) last.sql += `\n${sql}`;
    else out.push({ mode, sql });
  }
  return out;
}

const parts = [
  `-- Mybigmarket — application de toutes les migrations (${files.length} fichiers)
-- Régénérer avec : npm run db:sql:all
-- Appliquer avec : psql "$DATABASE_URL" -f migrate-all.sql
--
-- Idempotent : une migration déjà appliquée est ignorée, via la même table de
-- suivi que drizzle-kit (drizzle.__drizzle_migrations), qu'elle ait été passée
-- par ce fichier ou par \`npm run db:migrate\`. Ne jamais modifier une migration
-- déjà passée : créer une nouvelle migration.
`,
  `CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
`,
];

for (const file of files) {
  const raw = readFileSync(resolve(migrationsDir, file), "utf8");
  const body = raw.trim();
  // Empreinte enregistrée par `drizzle-kit migrate` (SHA-256 du fichier brut) :
  // une base migrée avec l'outil officiel est reconnue et rien n'est rejoué.
  const drizzleHash = createHash("sha256").update(raw).digest("hex");
  if (body.includes("$$")) throw new Error(`${file} : dollar-quoting imbriqué, bloc DO cassé.`);

  parts.push(`\n-- ============ ${file} ============`);
  for (const { mode, sql } of groups(statements(body))) {
    const tag = `${file}:${mode}:${fingerprint(sql)}`;
    const note =
      mode === "plain"
        ? ""
        : "    -- ALTER TYPE … ADD VALUE : commande utilitaire, via EXECUTE et seule\n" +
          "    -- dans sa transaction (contrainte PostgreSQL).\n";
    parts.push(`DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('${tag}', '${drizzleHash}')) THEN
${note}    EXECUTE $sql$
${sql}
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('${tag}', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;
`);
  }
}

parts.push(`
-- Contrôle final : doit afficher le nombre de fichiers ci-dessus.
SELECT count(*) AS migrations_appliquees FROM drizzle.__drizzle_migrations;
`);

const target = resolve(root, "migrate-all.sql");
writeFileSync(target, parts.join("\n"));
const kb = Math.round(readFileSync(target).byteLength / 1024);
console.log(`migrate-all.sql écrit : ${files.length} migrations, ${kb} Ko`);
