/**
 * Accès base de données pour la couche service.
 *
 * Le type `Db` est commun au pilote de production (postgres-js / Neon) et à PGlite
 * utilisé dans les tests : les repositories reçoivent une instance, ils ne la créent pas.
 */
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { getDb as getRuntimeDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { errors } from "@/server/core/errors";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
/** Une requête peut s'exécuter sur la connexion ou dans une transaction en cours. */
export type Executor = Db | Tx;

let override: Db | null = null;

/** Tests : remplace la base (PGlite) le temps d'un fichier de test. */
export function setDbForTests(db: Db | null) {
  override = db;
}

export function db(): Db {
  if (override) return override;
  if (!process.env.DATABASE_URL) throw errors.unavailable("La base de données n'est pas configurée (DATABASE_URL).");
  return getRuntimeDb() as unknown as Db;
}

export { schema };
