"use server";

import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { headers } from "next/headers";
import { hashPassword } from "@/server/core/auth/password";
import { clientIp } from "@/server/core/http/request-context";
import { db as serviceDb } from "@/server/core/db";
import { enforceRateLimit } from "@/server/core/rate-limit";

export type AuthState = { error?: string };
function safeCallbackUrl(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/compte/commandes";
}
const loginSchema = z.object({ email: z.string().email("Adresse e-mail invalide."), password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.") });
const registerSchema = z.object({ name: z.string().min(2, "Saisissez votre nom."), email: z.string().email("Adresse e-mail invalide."), phone: z.string().min(8, "Saisissez un téléphone valide."), password: z.string().min(10, "10 caractères minimum.") });

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les champs." };
  try {
    await signIn("credentials", { email: parsed.data.email.toLowerCase(), password: parsed.data.password, redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
  } catch (error) {
    if (error instanceof AuthError) return { error: "E-mail ou mot de passe incorrect." };
    throw error;
  }
  return {};
}

export async function registerAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Vérifiez les champs." };
  try {
    await enforceRateLimit(serviceDb, "auth.register", `shop:${clientIp(await headers()) ?? "unknown"}`);
  } catch {
    return { error: "Trop de créations de compte depuis cette connexion. Réessayez dans une heure." };
  }
  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "Cette adresse e-mail possède déjà un compte." };
  const passwordHash = await hashPassword(parsed.data.password);
  await db.insert(users).values({ name: parsed.data.name.trim(), email, phone: parsed.data.phone.trim(), passwordHash, role: "buyer" });
  try {
    await signIn("credentials", { email, password: parsed.data.password, redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Compte créé. Connectez-vous avec vos identifiants." };
    throw error;
  }
  return {};
}
