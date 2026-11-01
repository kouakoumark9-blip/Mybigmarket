import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function requireUser(returnTo?: string) {
  const session = await auth();
  const loginUrl = returnTo ? `/connexion?callbackUrl=${encodeURIComponent(returnTo)}` : "/connexion";
  if (!session?.user?.id) redirect(loginUrl);
  const db=getDb();
  const [current]=await db.select({id:users.id,name:users.name,email:users.email,role:users.role,status:users.status}).from(users).where(eq(users.id,session.user.id)).limit(1);
  if(!current||current.status!=="active")redirect("/connexion");
  return current;
}

export async function requireRole(role: "buyer" | "seller" | "admin") {
  const user = await requireUser();
  if (user.role !== role) redirect("/");
  return user;
}

/**
 * Vérifie l'état du compte directement en base à chaque écriture sensible.
 * La session JWT peut rester valide après une suspension : on ne s'y fie pas pour agir.
 */
export async function assertActiveAccount(userId: string, expectedRole?: "buyer" | "seller" | "admin") {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const [current] = await db.select({ status: users.status, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!current || current.status !== "active") throw new Error("ACCOUNT_INACTIVE");
  if (expectedRole && current.role !== expectedRole) throw new Error("ACCOUNT_ROLE_MISMATCH");
}
