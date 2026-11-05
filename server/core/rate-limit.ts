/**
 * Limitation de débit, fenêtre fixe.
 *
 * - Upstash Redis si UPSTASH_REDIS_REST_URL et UPSTASH_REDIS_REST_TOKEN sont définis
 *   (API REST, aucune dépendance) ;
 * - sinon PostgreSQL (table rate_limit_buckets, incrément atomique en une requête) ;
 * - en mémoire pour les tests.
 *
 * Contrairement à un compteur en mémoire, les deux premières implémentations sont
 * partagées entre toutes les instances Vercel.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import { logger, errorContext } from "@/server/core/logger";

export type RateLimitPolicy = { limit: number; windowSeconds: number };

export const RATE_LIMIT_POLICIES = {
  "auth.login": { limit: 10, windowSeconds: 15 * 60 },
  "auth.register": { limit: 5, windowSeconds: 60 * 60 },
  "auth.refresh": { limit: 60, windowSeconds: 15 * 60 },
  "shop.cart": { limit: 120, windowSeconds: 60 },
  "shop.search": { limit: 60, windowSeconds: 60 },
  "shop.default": { limit: 300, windowSeconds: 60 },
  // Formulaires publics (contact…) : limite stricte contre le spam.
  "shop.forms": { limit: 10, windowSeconds: 60 * 60 },
  "shop.quote": { limit: 30, windowSeconds: 60 },
  "admin.default": { limit: 600, windowSeconds: 60 },
  "admin.write": { limit: 120, windowSeconds: 60 },
  "admin.ai": { limit: 10, windowSeconds: 60 },
  ai: { limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

export type RateLimitDecision = { allowed: boolean; remaining: number; limit: number; resetSeconds: number };

export interface RateLimiter {
  hit(key: string, policy: RateLimitPolicy, now?: Date): Promise<RateLimitDecision>;
}

function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

function decision(count: number, policy: RateLimitPolicy, start: Date, now: Date): RateLimitDecision {
  const resetSeconds = Math.max(1, Math.ceil((start.getTime() + policy.windowSeconds * 1000 - now.getTime()) / 1000));
  return { allowed: count <= policy.limit, remaining: Math.max(0, policy.limit - count), limit: policy.limit, resetSeconds };
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { start: number; count: number }>();
  async hit(key: string, policy: RateLimitPolicy, now = new Date()) {
    const start = windowStart(now, policy.windowSeconds);
    const bucket = this.buckets.get(key);
    const count = bucket && bucket.start === start.getTime() ? bucket.count + 1 : 1;
    this.buckets.set(key, { start: start.getTime(), count });
    return decision(count, policy, start, now);
  }
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly database: () => Db) {}
  async hit(key: string, policy: RateLimitPolicy, now = new Date()) {
    const start = windowStart(now, policy.windowSeconds);
    const expires = new Date(start.getTime() + policy.windowSeconds * 1000);
    const result = await this.database().execute<{ count: number }>(sql`
      insert into rate_limit_buckets (key, window_start, count, expires_at)
      values (${key}, ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
      on conflict (key) do update set
        count = case when rate_limit_buckets.window_start = excluded.window_start then rate_limit_buckets.count + 1 else 1 end,
        window_start = excluded.window_start,
        expires_at = excluded.expires_at
      returning count`);
    const rows = (result as unknown as { rows?: Array<{ count: number }> }).rows ?? (result as unknown as Array<{ count: number }>);
    return decision(Number(rows[0]?.count ?? 1), policy, start, now);
  }
}

export class UpstashRateLimiter implements RateLimiter {
  constructor(private readonly url: string, private readonly token: string) {}
  async hit(key: string, policy: RateLimitPolicy, now = new Date()) {
    const start = windowStart(now, policy.windowSeconds);
    const redisKey = `rl:${key}:${start.getTime()}`;
    const response = await fetch(`${this.url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, String(policy.windowSeconds + 5)]]),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash ${response.status}`);
    const [incr] = (await response.json()) as Array<{ result?: number }>;
    return decision(Number(incr?.result ?? 1), policy, start, now);
  }
}

let limiter: RateLimiter | null = null;

export function setRateLimiter(next: RateLimiter | null) {
  limiter = next;
}

export function rateLimiter(database: () => Db): RateLimiter {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  limiter = url && token ? new UpstashRateLimiter(url, token) : new PostgresRateLimiter(database);
  return limiter;
}

/**
 * Consomme une unité ; lève RATE_LIMITED (429 + Retry-After) au-delà de la limite.
 * Si le stockage des compteurs est indisponible, la requête passe (fail-open) et l'incident
 * est journalisé : une panne de compteur ne doit pas couper la boutique.
 */
export async function enforceRateLimit(database: () => Db, policyName: RateLimitPolicyName, subject: string): Promise<RateLimitDecision | null> {
  const policy = RATE_LIMIT_POLICIES[policyName];
  try {
    const result = await rateLimiter(database).hit(`${policyName}:${subject}`.slice(0, 200), policy);
    if (!result.allowed) throw errors.rateLimited(result.resetSeconds);
    return result;
  } catch (error) {
    if ((error as { code?: string }).code === "RATE_LIMITED") throw error;
    logger.warn("rate_limit.unavailable", { policy: policyName, ...errorContext(error) });
    return null;
  }
}
