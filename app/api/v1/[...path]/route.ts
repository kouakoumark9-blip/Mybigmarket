/**
 * Point d'entrée unique de l'API REST v1 (/api/v1/admin/…, /api/v1/shop/…, /api/v1/openapi.json).
 * Le routage, l'authentification, les permissions et la validation sont dans server/.
 */
import { handleApi } from "@/server/api/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function handler(request: Request, context: Context) {
  const { path } = await context.params;
  return handleApi(request, path);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
