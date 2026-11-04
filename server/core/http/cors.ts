/**
 * CORS restrictif.
 *
 * - API boutique : même origine uniquement (+ origines listées dans CORS_ALLOWED_ORIGINS).
 * - API admin : origines listées dans ADMIN_CORS_ALLOWED_ORIGINS (le back-office), jamais `*`.
 * L'authentification admin passe par l'en-tête Authorization, pas par cookie : aucun
 * `Access-Control-Allow-Credentials` n'est émis.
 */
function allowedOrigins(surface: "admin" | "shop"): Set<string> {
  const raw = surface === "admin" ? process.env.ADMIN_CORS_ALLOWED_ORIGINS : process.env.CORS_ALLOWED_ORIGINS;
  return new Set((raw || "").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean));
}

export function corsHeaders(request: Request, surface: "admin" | "shop"): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins(surface).has(origin)) return { vary: "Origin" };
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-expose-headers": "x-request-id, x-ratelimit-limit, x-ratelimit-remaining, retry-after, idempotent-replayed",
  };
}

export function preflight(request: Request, surface: "admin" | "shop"): Response {
  const headers = corsHeaders(request, surface);
  if (!headers["access-control-allow-origin"]) return new Response(null, { status: 403, headers });
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, idempotency-key, x-request-id, x-shop-code",
      "access-control-max-age": "600",
    },
  });
}
