import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

let connectionUrl: string | undefined;
let sqlClient: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n’est pas configurée. Copiez .env.example et renseignez Neon.");
  if (!sqlClient || !database || connectionUrl !== url) {
    sqlClient?.end({ timeout: 1 }).catch(() => undefined);
    connectionUrl = url;
    sqlClient = postgres(url, { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 20 });
    database = drizzle(sqlClient, { schema });
  }
  return database;
}
