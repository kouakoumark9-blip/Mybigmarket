import { defineRoute, type AnyRoute } from "@/server/core/http/route";
import { errors } from "@/server/core/errors";
import { accessTokensConfigured } from "@/server/core/auth/tokens";
import { enforceRateLimit } from "@/server/core/rate-limit";
import * as service from "@/server/modules/auth/service";
import { loginBody, refreshBody, tokenResponse } from "@/server/modules/team/validators";

const tags = ["Authentification"];

function assertConfigured() {
  if (!accessTokensConfigured()) throw errors.unavailable("ADMIN_API_JWT_SECRET n'est pas configuré : l'API d'administration est désactivée.");
}

export const authRoutes: AnyRoute[] = [
  defineRoute({
    id: "admin.auth.login", method: "POST", path: "/admin/auth/login", surface: "admin", auth: "none", tags, rateLimit: "auth.login", status: 200,
    summary: "Connexion employé", description: "E-mail + mot de passe (+ code TOTP si la double authentification est activée). Renvoie un jeton d'accès (10 min) et un jeton de rafraîchissement à usage unique (30 jours).",
    body: loginBody, response: tokenResponse,
    handler: async ({ db, body, meta }) => {
      assertConfigured();
      await enforceRateLimit(() => db, "auth.login", `${meta.ip ?? "unknown"}:${body.email}`);
      return service.login(db, body, meta);
    },
  }),
  defineRoute({
    id: "admin.auth.refresh", method: "POST", path: "/admin/auth/refresh", surface: "admin", auth: "none", tags, rateLimit: "auth.refresh", status: 200,
    summary: "Renouveler les jetons", description: "Échange le jeton de rafraîchissement contre une nouvelle paire. L'ancien jeton devient invalide ; le réutiliser révoque toute la session.",
    body: refreshBody, response: tokenResponse,
    handler: async ({ db, body, meta }) => {
      assertConfigured();
      return service.refresh(db, body, meta);
    },
  }),
  defineRoute({
    id: "admin.auth.logout", method: "POST", path: "/admin/auth/logout", surface: "admin", tags, status: 204,
    summary: "Déconnexion (révoque la session)",
    handler: async ({ db, admin, meta }) => { await service.logout(db, admin, meta); },
  }),
  defineRoute({
    id: "admin.auth.me", method: "GET", path: "/admin/me", surface: "admin", tags, permission: "dashboard.read",
    summary: "Profil et permissions de l'appelant",
    handler: ({ db, admin }) => service.me(db, admin),
  }),
];
