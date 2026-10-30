import { NextResponse } from "next/server";
import { z } from "zod";
import { addMockMessage, MOCK_ACTORS } from "@/lib/demo-backend";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
const messageSchema = z.object({ role: z.enum(["buyer", "seller"]), actorId: z.string().min(1), body: z.string().trim().min(1).max(1000) });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message invalide." }, { status: 400 });
  if (!MOCK_ACTORS[parsed.data.role].some((actor) => actor.id === parsed.data.actorId)) return NextResponse.json({ error: "Profil de démonstration invalide." }, { status: 403 });
  const { id } = await context.params;
  const message = addMockMessage(id, parsed.data.role, parsed.data.actorId, parsed.data.body);
  if (!message) return NextResponse.json({ error: "Conversation introuvable ou accès non autorisé." }, { status: 404 });
  return NextResponse.json({ message }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
