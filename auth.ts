import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from "@/server/core/auth/password";
import { clientIp } from "@/server/core/http/request-context";
import { db as serviceDb } from "@/server/core/db";
import { enforceRateLimit } from "@/server/core/rate-limit";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  // Cookies de session : toujours « Secure » en production (en plus de HttpOnly et SameSite=Lax appliqués par défaut).
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: { signIn: "/connexion" },
  providers: [Credentials({
    credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Mot de passe", type: "password" } },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const email = parsed.data.email.toLowerCase();
      // Limite partagée entre instances : 10 tentatives / 15 min par IP et adresse.
      try {
        await enforceRateLimit(serviceDb, "auth.login", `shop:${clientIp(request.headers) ?? "unknown"}:${email}`);
      } catch {
        return null;
      }
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || user.status !== "active") {
        await verifyAgainstDummy(parsed.data.password);
        return null;
      }
      const valid = await verifyPassword(parsed.data.password, user.passwordHash);
      if (!valid) return null;
      // Migration transparente des anciens hashes bcrypt vers argon2id.
      if (needsRehash(user.passwordHash)) await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(users.id, user.id));
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = ((user as { role?: "buyer" | "seller" | "admin" }).role || "buyer");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id || "");
        session.user.role = (token.role as "buyer" | "seller" | "admin") || "buyer";
      }
      return session;
    },
  },
});
