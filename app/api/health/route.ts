import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * État de santé de l'application : diagnostiquer une panne en production sans
 * accès aux journaux Vercel.
 *
 * Volontairement public et sans secret : ni contenu métier, ni identifiant, ni
 * chaîne de connexion. Il répond à la seule question utile quand le site
 * affiche « This page couldn't load » : la base répond-elle, et le schéma
 * est-il réellement migré ?
 *
 * - 503 `configuration` : DATABASE_URL absente de l'environnement.
 * - 503 `connexion` : base injoignable (le code PostgreSQL/driver est traduit
 *   en cause probable).
 * - 503 `schema` : la base répond mais les tables manquent — c'est un
 *   déploiement à corriger, pas un incident applicatif.
 * - 200 `operationnel` : la base répond et les tables attendues existent.
 */
export async function GET() {
  const startedAt = Date.now();

  if (!process.env.DATABASE_URL) {
    return Response.json(
      {
        ok: false,
        etape: "configuration",
        probleme: "DATABASE_URL absente de l'environnement.",
        action:
          "Ajouter DATABASE_URL (URL pooled Neon, sslmode=require) dans les variables du projet Vercel, puis redéployer.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const tablesAttendues = [
    "users",
    "products",
    "categories",
    "seller_profiles",
    "orders",
    "invoices",
    "document_sequences",
  ];

  try {
    const db = getDb();
    // `= any($1)` ne prend pas un tableau lié côté driver : on construit
    // explicitement une liste `in ($1, $2, …)`.
    const cibles = sql.join(
      tablesAttendues.map((table) => sql`${table}`),
      sql`, `,
    );
    const result = await db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name in (${cibles})
    `);
    const presentes = (result as unknown as Array<{ table_name: string }>).map(
      (row) => row.table_name,
    );
    const manquantes = tablesAttendues.filter((table) => !presentes.includes(table));
    const latencyMs = Date.now() - startedAt;

    if (manquantes.length > 0) {
      return Response.json(
        {
          ok: false,
          etape: "schema",
          base: "joignable",
          tablesManquantes: manquantes,
          probleme: "La base répond mais le schéma n'est pas migré.",
          action:
            'Appliquer les migrations : psql "$DATABASE_URL" -f migrate-all.sql — puis relancer ce contrôle.',
          latencyMs,
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    return Response.json(
      {
        ok: true,
        etape: "operationnel",
        base: "joignable",
        tablesVerifiees: tablesAttendues.length,
        latencyMs,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "erreur inconnue";
    const code = (error as { cause?: { code?: string } })?.cause?.code;

    return Response.json(
      {
        ok: false,
        etape: "connexion",
        probleme: "La base ne répond pas à la requête.",
        code: code ?? null,
        // Le message du driver ne contient jamais la chaîne de connexion.
        detail: message.slice(0, 200),
        action:
          code === "28P01" || code === "28000"
            ? "Identifiants Neon refusés : vérifier DATABASE_URL (mot de passe, rôle)."
            : code === "ENOTFOUND" || code === "ETIMEDOUT"
              ? "Hôte injoignable : vérifier DATABASE_URL et que le projet Neon n'est pas suspendu."
              : "Vérifier DATABASE_URL et l'état du projet Neon.",
        latencyMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
