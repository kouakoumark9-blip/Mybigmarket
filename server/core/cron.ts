/**
 * Routes de Vercel Cron : authentification par `Authorization: Bearer CRON_SECRET` (comparaison
 * à temps constant), puis exécution des tâches nommées, historisées et verrouillées.
 */
import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/core/db";
import { runTask } from "@/server/core/tasks";
import "@/server/modules/maintenance/tasks";

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Exécute les tâches dans l'ordre ; 500 si l'une échoue (visible dans les journaux Vercel). */
export async function runCronTasks(request: Request, codes: string[]): Promise<Response> {
  if (!cronAuthorized(request)) return Response.json({ error: { code: "UNAUTHENTICATED", message: "Non autorisé." } }, { status: 401 });
  const results = [];
  for (const code of codes) results.push(await runTask(db(), code, { trigger: "cron" }));
  const failed = results.some((result) => result.status === "failed");
  return Response.json({ data: results }, { status: failed ? 500 : 200, headers: { "cache-control": "no-store" } });
}
