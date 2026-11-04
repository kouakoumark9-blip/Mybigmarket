import { randomUUID } from "node:crypto";

export type RequestMeta = { requestId: string; ip: string | null; userAgent: string | null };

/** Adresse IP client derrière le proxy Vercel (première valeur de x-forwarded-for). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim() || null;
  if (!candidate) return null;
  return /^[0-9a-fA-F:.]{3,45}$/.test(candidate) ? candidate : null;
}

export function requestMeta(request: Request): RequestMeta {
  const incoming = request.headers.get("x-request-id");
  const requestId = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  return { requestId, ip: clientIp(request.headers), userAgent: request.headers.get("user-agent")?.slice(0, 500) || null };
}
