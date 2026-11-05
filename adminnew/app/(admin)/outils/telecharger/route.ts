/**
 * Téléchargement d'un fichier CSV de l'API (exports, modèles et rapports d'import), avec les droits
 * de l'employé connecté. Seuls les chemins listés ici sont relayés.
 */
import { adminApiRaw, apiErrorMessage } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const ALLOWED = [
  /^\/admin\/exports\/(products|categories|brands|customers|orders)\.csv$/,
  /^\/admin\/imports\/templates\/(products|categories|brands)$/,
  /^\/admin\/imports\/[0-9a-f-]{36}\/report\.csv$/,
  /^\/admin\/stats\/daily\.csv$/,
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("chemin") ?? "";
  if (!ALLOWED.some((pattern) => pattern.test(path))) return new Response("Fichier non autorisé.", { status: 400 });
  const query = Object.fromEntries([...url.searchParams.entries()].filter(([key]) => key !== "chemin"));
  try {
    const upstream = await adminApiRaw(path, query);
    const name = path.split("/").filter(Boolean).slice(-1)[0].replace(/\.csv$/, "");
    return new Response(upstream.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="mybigmarket-${name}.csv"`, "cache-control": "no-store" } });
  } catch (error) {
    return new Response(apiErrorMessage(error), { status: 502 });
  }
}
