import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shippingQuotes } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Purge des devis de transport expirés (module 4).
 *
 * Les devis sont conservés 30 minutes côté client pour prouver le prix annoncé,
 * puis purgés par lots. Pas de suppression massive en une requête : la table
 * peut grossir vite et on ne veut pas bloquer la base.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date();
  let deleted = 0;
  // 5 lots de 500 : borne haute d'une exécution, le reste attend le prochain passage.
  for (let batch = 0; batch < 5; batch += 1) {
    const expired = await db
      .select({ id: shippingQuotes.id })
      .from(shippingQuotes)
      .where(lt(shippingQuotes.expiresAt, now))
      .limit(500);
    if (!expired.length) break;
    const result = await db.delete(shippingQuotes).where(lt(shippingQuotes.expiresAt, now));
    deleted += Number((result as unknown as { rowCount?: number }).rowCount ?? expired.length);
  }

  return Response.json({ ok: true, deleted, at: now.toISOString() });
}
