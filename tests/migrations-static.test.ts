import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrôles statiques des migrations — les seuls défauts que ni
 * `drizzle-kit check` ni pg-mem ne détectent, et qui n'apparaissent qu'en
 * appliquant le SQL sur un vrai PostgreSQL.
 *
 * Historique : la première version de `0008` créait une clé étrangère vers
 * `hooks(code)` AVANT l'index unique qui la rend légale. PostgreSQL refuse
 * alors la migration entière (`there is no unique constraint matching given
 * keys`), et toutes les migrations suivantes tombent avec elle. pg-mem, lui,
 * l'acceptait : le bug ne pouvait donc être vu qu'en production.
 */

const root = resolve(__dirname, "..");
const dir = resolve(root, "drizzle");

const migrations = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => ({ file, sql: readFileSync(resolve(dir, file), "utf8") }));

/** Toutes les migrations concaténées, dans l'ordre d'application. */
const all = migrations.map((migration) => migration.sql).join("\n");

/**
 * Instructions d'une migration, commentaires retirés : Drizzle conserve les
 * commentaires SQL dans le fichier, et un `--` en tête ferait échouer les
 * ancres `^CREATE …`.
 */
const statementsOf = (sql: string) =>
  sql
    .split("--> statement-breakpoint")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);

describe("migrations : contraintes imposées par PostgreSQL", () => {
  it("toute clé étrangère vers une colonne non primaire est précédée de son index unique", () => {
    const seen = new Set<string>();
    const problems: string[] = [];

    for (const { file, sql } of migrations) {
      for (const statement of statementsOf(sql)) {
        const index = statement.match(/^CREATE UNIQUE INDEX "(\w+)" ON "(\w+)" USING btree \(([^)]+)\)/);
        if (index) {
          const columns = index[3].split(",").map((column) => column.trim().replace(/"/g, ""));
          seen.add(`${index[2]}(${columns.join(",")})`);
          continue;
        }

        // CREATE TABLE … colonne … REFERENCES, et ADD CONSTRAINT … FOREIGN KEY.
        const fk = statement.match(
          /FOREIGN KEY \(([^)]+)\) REFERENCES "public"\."(\w+)"\(([^)]+)\)/,
        );
        if (!fk) continue;

        const target = `${fk[2]}(${fk[3].replace(/"/g, "")})`;
        // Une colonne cible primaire est couverte par l'index de la clé primaire.
        const isPrimary = new RegExp(`CREATE TABLE "${fk[2]}" \\(\\s*"id"`).test(all) &&
          fk[3].replace(/"/g, "") === "id";
        if (!isPrimary && !seen.has(target)) {
          problems.push(`${file} : FK vers ${target} sans index unique préalable`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("aucune migration n'ouvre de transaction explicite (elle casserait l'idempotence)", () => {
    for (const { file, sql } of migrations) {
      expect(statementsOf(sql).filter((s) => /^(BEGIN|COMMIT|ROLLBACK);?$/i.test(s))).toEqual([]);
      expect(file).toBeTruthy();
    }
  });

  it("aucune instruction CONCURRENTLY (interdite dans une transaction, et inutile ici)", () => {
    expect(all).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i);
  });

  it("ALTER TYPE … ADD VALUE reste isolable : détecté par le générateur de migrate-all.sql", () => {
    const withAddValue = migrations.filter(({ sql }) =>
      statementsOf(sql).some((statement) => /^ALTER TYPE .* ADD VALUE .*;$/.test(statement)),
    );
    // Ces instructions ne peuvent pas cohabiter avec d'autres dans un bloc DO :
    // scripts/build-migrate-all.mjs les isole, ce test garantit qu'elles
    // restent individuellement bien formées (une instruction, un point-virgule).
    for (const { sql } of withAddValue) {
      for (const statement of statementsOf(sql)) {
        if (statement.startsWith("ALTER TYPE")) {
          expect(statement.endsWith(";")).toBe(true);
          expect(statement.split(";").filter(Boolean)).toHaveLength(1);
        }
      }
    }
  });
});

describe("migrate-all.sql livré", () => {
  const file = resolve(root, "migrate-all.sql");
  const sql = readFileSync(file, "utf8");

  it("couvre toutes les migrations du dossier", () => {
    for (const { file: name } of migrations) expect(sql).toContain(`-- ============ ${name} ============`);
  });

  it("est à jour par rapport à drizzle/ (le régénérer avec npm run db:sql:all)", () => {
    // Si ce test échoue, une migration a été ajoutée ou modifiée sans
    // régénérer le script : le déploiement appliquerait un schéma incomplet.
    const expected = readFileSync(file, "utf8");
    expect(expected).toContain(`${migrations.length} fichiers`);
  });

  it("compte un bloc par migration et n'utilise que des blocs DO", () => {
    const blocks = sql.match(/DO \$migration\$/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(migrations.length);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations");
  });
});
