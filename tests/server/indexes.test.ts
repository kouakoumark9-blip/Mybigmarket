/**
 * Revue des index, vérifiée sur le schéma réellement migré (PGlite) :
 * - chaque clé étrangère est couverte par un index qui commence par ses colonnes
 *   (jointures, et suppressions ou mises à jour en cascade sans parcours complet) ;
 * - chaque colonne proposée en filtre ou en tri par une liste de l'API figure dans un index
 *   de sa table.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/server/core/db";
import { createTestDatabase } from "../helpers/test-api";

vi.mock("@/auth", () => ({ auth: async () => null }));

let db: Db;
const rows = async <T>(query: ReturnType<typeof sql>) => ((await db.execute(query)) as unknown as { rows: T[] }).rows;

beforeAll(async () => {
  ({ db } = await createTestDatabase());
});

describe("index de la base", () => {
  it("couvre chaque clé étrangère par un index qui commence par ses colonnes", async () => {
    const uncovered = await rows<{ tbl: string; cols: string }>(sql`
      with fk as (
        select c.conrelid, c.conrelid::regclass::text as tbl, c.conkey,
               (select string_agg(a.attname, ',' order by k.ord) from unnest(c.conkey) with ordinality k(attnum, ord)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols
        from pg_constraint c
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      )
      select tbl, cols from fk
      where not exists (
        select 1 from pg_index i
        where i.indrelid = fk.conrelid
          and (i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1] @> fk.conkey::int2[]
          and (i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1] <@ fk.conkey::int2[]
      )
      order by 1, 2`);
    expect(uncovered.map((row) => `${row.tbl}(${row.cols})`)).toEqual([]);
  });

  it("indexe chaque colonne de filtre et de tri des listes de l'API", async () => {
    const { ALL_ROUTES } = await import("@/server/api/registry");
    const wanted = new Map<string, Set<string>>();
    for (const route of ALL_ROUTES) {
      if (!route.list) continue;
      const columns: AnyPgColumn[] = [...Object.values(route.list.sortable ?? {}), ...Object.values(route.list.filterable ?? {}).map((field) => field.column)] as AnyPgColumn[];
      for (const column of columns) {
        const table = getTableName(column.table);
        if (!wanted.has(table)) wanted.set(table, new Set());
        wanted.get(table)!.add(column.name);
      }
    }
    const indexed = await rows<{ tbl: string; col: string }>(sql`
      select t.relname as tbl, a.attname as col
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey::int2[])`);
    const has = new Set(indexed.map((row) => `${row.tbl}.${row.col}`));
    const missing = [...wanted].flatMap(([table, columns]) => [...columns].filter((column) => !has.has(`${table}.${column}`)).map((column) => `${table}.${column}`)).sort();
    expect(wanted.size).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});
