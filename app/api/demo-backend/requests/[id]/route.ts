import { NextResponse } from "next/server";
import { z } from "zod";
import { MOCK_ACTORS, updateMockRequest, type MockRole } from "@/lib/demo-backend";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
const updateSchema = z.object({ role: z.enum(["seller", "admin"]), actorId: z.string().min(1), status: z.enum(["in_review", "quoted", "closed"]) });
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mise à jour invalide." }, { status: 400 });
  const allowedActors = MOCK_ACTORS[parsed.data.role as MockRole];
  if (!allowedActors.some((actor) => actor.id === parsed.data.actorId)) return NextResponse.json({ error: "Profil de démonstration invalide." }, { status: 403 });
  const { id } = await context.params;
  const updated = updateMockRequest(id, parsed.data.status, parsed.data.role, parsed.data.actorId);
  if (!updated) return NextResponse.json({ error: "Demande introuvable ou accès non autorisé." }, { status: 404 });
  return NextResponse.json({ request: updated }, { headers: { "Cache-Control": "no-store" } });
}
