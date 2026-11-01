import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type AccountSnapshot = { status: "active" | "suspended" | "deleted"; role: "buyer" | "seller" | "admin" };

/**
 * Lit l'état réel du compte en base.
 *
 * Le JWT reste valide jusqu'à expiration : sans relecture, une session ouverte avant
 * une suspension continuerait d'agir. Renvoie `null` si l'utilisateur n'existe plus.
 */
export async function loadAccountSnapshot(userId: string): Promise<AccountSnapshot | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = getDb();
  const [current] = await db.select({ status: users.status, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return current ?? null;
}

export class AccountInactiveError extends Error {
  constructor() {
    super("ACCOUNT_INACTIVE");
    this.name = "AccountInactiveError";
  }
}

/**
 * Refuse une écriture si le compte n'est plus actif (ou si le rôle a changé).
 * En mode démonstration (pas de base), aucune vérification n'est possible : on laisse passer,
 * le reste du flux étant déjà inopérant sans base.
 */
export async function assertActiveAccount(userId: string, expectedRole?: "buyer" | "seller" | "admin"): Promise<void> {
  const account = await loadAccountSnapshot(userId);
  if (!process.env.DATABASE_URL) return;
  if (!account || account.status !== "active") throw new AccountInactiveError();
  if (expectedRole && account.role !== expectedRole) throw new Error("ACCOUNT_ROLE_MISMATCH");
}
