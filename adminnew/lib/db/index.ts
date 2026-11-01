import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
let activeUrl: string | undefined;

export function getAdminDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured for mybigmarket-adminnew.");
  if (!client || !database || activeUrl !== url) {
    client?.end({ timeout: 1 }).catch(() => undefined);
    activeUrl = url;
    client = postgres(url, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10 });
    database = drizzle(client, { schema });
  }
  return database;
}
