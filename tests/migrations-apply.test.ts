/**
 * Applique réellement les migrations sur PostgreSQL (PGlite, PostgreSQL 18 en WebAssembly).
 * Vérifie les trois chemins de déploiement : outil Drizzle, `migrate-all.sql`, et leur mélange.
 */
import { mkdtempSync, copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "drizzle");
const migrateAll = readFileSync(join(process.cwd(), "migrate-all.sql"), "utf8");
const sqlFiles = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

/** Dossier de migrations tronqué : simule une base restée sur une version antérieure. */
function migrationsUpTo(lastIndex: number): string {
  const dir = mkdtempSync(join(tmpdir(), "mbm-migrations-"));
  mkdirSync(join(dir, "meta"));
  for (const file of sqlFiles.filter((name) => Number(name.slice(0, 4)) <= lastIndex)) copyFileSync(join(migrationsDir, file), join(dir, file));
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8"));
  journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= lastIndex);
  writeFileSync(join(dir, "meta", "_journal.json"), JSON.stringify(journal));
  return dir;
}

async function publicTableCount(client: PGlite) {
  const result = await client.query<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  return result.rows[0].n;
}

describe("migrations sur PostgreSQL réel", () => {
  it("l'outil Drizzle applique tout l'historique", async () => {
    const client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder: migrationsDir });
    expect(await publicTableCount(client)).toBeGreaterThanOrEqual(107);
    const shops = await client.query<{ code: string; is_default: boolean }>("select code, is_default from shops");
    expect(shops.rows).toEqual([{ code: "default", is_default: true }]);
  });

  it("migrate-all.sql est idempotent sur une base neuve", async () => {
    const client = new PGlite();
    await client.exec(migrateAll);
    await client.exec(migrateAll);
    expect(await publicTableCount(client)).toBeGreaterThanOrEqual(107);
  });

  it("migrate-all.sql complète une base migrée par Drizzle sans rien rejouer et conserve les données", async () => {
    const client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder: migrationsUpTo(12) });
    await client.exec(`insert into settings (key, value) values ('shop.name', '"Ma boutique"'::jsonb)`);
    await client.exec(migrateAll);
    await client.exec(migrateAll);
    const setting = await client.query<{ shop_id: string; value: string }>("select shop_id::text, value from settings where key = 'shop.name'");
    expect(setting.rows[0]).toEqual({ shop_id: "00000000-0000-4000-8000-000000000001", value: "Ma boutique" });
    const docs = await client.query("select 1 from information_schema.tables where table_name = 'document_sequences'");
    expect(docs.rows).toHaveLength(1);
  });

  it("l'outil Drizzle ne rejoue rien après migrate-all.sql", async () => {
    const client = new PGlite();
    await client.exec(migrateAll);
    await expect(migrate(drizzle(client), { migrationsFolder: migrationsDir })).resolves.toBeUndefined();
  });
});
