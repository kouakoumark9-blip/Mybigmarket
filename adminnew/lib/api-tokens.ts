/**
 * Jetons d'accès de l'API d'administration.
 *
 * - Jeton d'accès : JWT HS256, courte durée (10 min), signé avec ADMIN_API_JWT_SECRET.
 *   Rotation de secret sans coupure : ADMIN_API_JWT_SECRET_PREVIOUS reste accepté
 *   en vérification pendant la transition.
 * - Jeton de rafraîchissement : aléatoire (256 bits), stocké haché (SHA-256) dans
 *   employee_sessions, à usage unique (rotation à chaque utilisation).
 * - Clés d'API : `mbm_<préfixe>_<secret>`, stockées hachées, préfixe visible pour les identifier.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const ISSUER = "mybigmarket";
const AUDIENCE = "mybigmarket-admin-api";

export type AccessClaims = {
  sub: string;
  /** Session (famille de jetons) d'origine ; absente pour les jetons émis par le back-office. */
  sid?: string;
  /** Date de changement du mot de passe (secondes) : un changement invalide les jetons existants. */
  pwd: number;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function secrets(): string[] {
  const current = process.env.ADMIN_API_JWT_SECRET?.trim();
  const previous = process.env.ADMIN_API_JWT_SECRET_PREVIOUS?.trim();
  return [current, previous].filter((value): value is string => Boolean(value && value.length >= 32));
}

export function accessTokensConfigured(): boolean {
  return secrets().length > 0;
}

function sign(content: string, secret: string): string {
  return createHmac("sha256", secret).update(content).digest("base64url");
}

export function signAccessToken(claims: Pick<AccessClaims, "sub" | "pwd"> & { sid?: string }, nowSeconds = Math.floor(Date.now() / 1000), ttl = ACCESS_TOKEN_TTL_SECONDS): string {
  const [secret] = secrets();
  if (!secret) throw new Error("ADMIN_API_JWT_SECRET (32 caractères minimum) n'est pas configuré.");
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ ...claims, iat: nowSeconds, exp: nowSeconds + ttl, iss: ISSUER, aud: AUDIENCE } satisfies AccessClaims));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

export type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; reason: "malformed" | "signature" | "expired" | "claims" | "not_configured" };

export function verifyAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): VerifyResult {
  const keys = secrets();
  if (!keys.length) return { ok: false, reason: "not_configured" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [header, payload, signature] = parts;
  let headerJson: { alg?: string };
  try {
    headerJson = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (headerJson.alg !== "HS256") return { ok: false, reason: "malformed" };
  const given = Buffer.from(signature);
  const valid = keys.some((secret) => {
    const expected = Buffer.from(sign(`${header}.${payload}`, secret));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!valid) return { ok: false, reason: "signature" };
  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || typeof claims.sub !== "string" || typeof claims.pwd !== "number") return { ok: false, reason: "claims" };
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return { ok: false, reason: "expired" };
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + 60) return { ok: false, reason: "claims" };
  return { ok: true, claims };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = `mbr_${randomBytes(32).toString("base64url")}`;
  return { token, hash: sha256(token) };
}

export const API_KEY_PATTERN = /^mbm_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString("hex").slice(0, 8);
  const key = `mbm_${prefix}_${randomBytes(32).toString("base64url")}`;
  return { key, prefix, hash: sha256(key) };
}

export function parseApiKey(value: string): { prefix: string; hash: string } | null {
  const match = API_KEY_PATTERN.exec(value);
  return match ? { prefix: match[1], hash: sha256(value) } : null;
}

/** Secondes depuis l'époque (précision utilisée dans les jetons). */
export function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
