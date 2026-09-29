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
