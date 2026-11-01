import type { NextAuthConfig } from "next-auth";

export const IDLE_TIMEOUT_MINUTES = 30;

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      const now = Date.now();
      if (user) {
        token.sub = user.id;
        token.roleCode = user.roleCode;
        token.permissions = user.permissions;
        token.passwordChangedAt = user.passwordChangedAt;
        token.lastActivityAt = now;
        return token;
      }
      const lastActivityAt = typeof token.lastActivityAt === "number" ? token.lastActivityAt : 0;
      if (!lastActivityAt || now - lastActivityAt > IDLE_TIMEOUT_MINUTES * 60_000) return null;
      token.lastActivityAt = now;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || "";
        session.user.roleCode = typeof token.roleCode === "string" ? token.roleCode : "";
        session.user.permissions = Array.isArray(token.permissions) ? token.permissions.filter((permission): permission is string => typeof permission === "string") : [];
        session.user.passwordChangedAt = typeof token.passwordChangedAt === "string" ? token.passwordChangedAt : "";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
