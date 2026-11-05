/**
 * Applique réellement les migrations sur PostgreSQL (PGlite, PostgreSQL 18 en WebAssembly).
 * Vérifie les trois chemins de déploiement : outil Drizzle, `migrate-all.sql`, et leur mélange.
 */
import { mkdtempSync, copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
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
    const client = new PGlite({ extensions: { unaccent, pg_trgm } });
    await migrate(drizzle(client), { migrationsFolder: migrationsDir });
    expect(await publicTableCount(client)).toBeGreaterThanOrEqual(107);
    const shops = await client.query<{ code: string; is_default: boolean }>("select code, is_default from shops");
    expect(shops.rows).toEqual([{ code: "default", is_default: true }]);
  });

  it("migrate-all.sql est idempotent sur une base neuve", async () => {
    const client = new PGlite({ extensions: { unaccent, pg_trgm } });
    await client.exec(migrateAll);
    await client.exec(migrateAll);
    expect(await publicTableCount(client)).toBeGreaterThanOrEqual(107);
  });

  it("migrate-all.sql complète une base migrée par Drizzle sans rien rejouer et conserve les données", async () => {
    const client = new PGlite({ extensions: { unaccent, pg_trgm } });
    await migrate(drizzle(client), { migrationsFolder: migrationsUpTo(12) });
    await client.exec(`insert into settings (key, value) values ('shop.name', '"Ma boutique"'::jsonb)`);
    await client.exec(migrateAll);
    await client.exec(migrateAll);
    const setting = await client.query<{ shop_id: string; value: string }>("select shop_id::text, value from settings where key = 'shop.name'");
    expect(setting.rows[0]).toEqual({ shop_id: "00000000-0000-4000-8000-000000000001", value: "Ma boutique" });
    const docs = await client.query("select 1 from information_schema.tables where table_name = 'document_sequences'");
    expect(docs.rows).toHaveLength(1);
  });

  it("la migration 0015 reprend le stock existant dans l'entrepôt par défaut sans modifier les compteurs", async () => {
    const client = new PGlite({ extensions: { unaccent, pg_trgm } });
    await migrate(drizzle(client), { migrationsFolder: migrationsUpTo(14) });
    await client.exec(`
      insert into users (id, name, email, password_hash, role) values ('10000000-0000-4000-8000-000000000001', 'Vendeur', 'vendeur@exemple.ci', 'x', 'seller');
      insert into categories (id, name, slug) values (1, 'Outillage', 'outillage');
      insert into products (id, seller_id, category_id, title, slug, description, price_xof, quantity)
        values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 1, 'Perceuse', 'perceuse', 'Perceuse', 25000, 42);
      insert into product_variants (product_id, name, value, stock) values ('20000000-0000-4000-8000-000000000001', 'Tension', '220 V', 7);
    `);
    await client.exec(migrateAll);
    await client.exec(migrateAll);
    const levels = await client.query<{ variant: boolean; physical: number; reserved: number }>(
      "select variant_id is not null as variant, physical_quantity as physical, reserved_quantity as reserved from stock_levels order by variant_id nulls first",
    );
    expect(levels.rows).toEqual([{ variant: false, physical: 42, reserved: 0 }, { variant: true, physical: 7, reserved: 0 }]);
    const product = await client.query<{ quantity: number }>("select quantity from products");
    expect(product.rows[0].quantity).toBe(42);
    const warehouse = await client.query<{ code: string; is_default: boolean }>("select code, is_default from warehouses");
    expect(warehouse.rows).toEqual([{ code: "principal", is_default: true }]);
  });

  it("l'outil Drizzle ne rejoue rien après migrate-all.sql", async () => {
    const client = new PGlite({ extensions: { unaccent, pg_trgm } });
    await client.exec(migrateAll);
    await expect(migrate(drizzle(client), { migrationsFolder: migrationsDir })).resolves.toBeUndefined();
  });
});
