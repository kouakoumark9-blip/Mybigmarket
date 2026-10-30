import { NextResponse } from "next/server";
import { z } from "zod";
import { createMockRequest, listMockRequests, MOCK_ACTORS, type MockRole } from "@/lib/demo-backend";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
const createSchema = z.object({
  role: z.literal("buyer"), actorId: z.string().min(1), kind: z.enum(["product", "sourcing"]),
  productTitle: z.string().trim().min(2).max(190), quantity: z.number().int().min(1).max(1_000_000),
  destination: z.string().trim().min(2).max(120), contactPhone: z.string().trim().min(8).max(32), message: z.string().trim().max(2000).default(""),
});

export async function GET(request: Request) {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  const url = new URL(request.url);
  const role = url.searchParams.get("role") as MockRole | null;
  const actorId = url.searchParams.get("actorId") || "";
  if (!role || !Object.hasOwn(MOCK_ACTORS, role) || !MOCK_ACTORS[role].some((actor) => actor.id === actorId)) return NextResponse.json({ error: "Profil de démonstration invalide." }, { status: 400 });
  return NextResponse.json({ requests: listMockRequests(role, actorId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vérifiez les champs de la demande." }, { status: 400 });
  if (!MOCK_ACTORS.buyer.some((actor) => actor.id === parsed.data.actorId)) return NextResponse.json({ error: "Acheteur de démonstration inconnu." }, { status: 403 });
  const actor = MOCK_ACTORS.buyer.find((item) => item.id === parsed.data.actorId)!;
  const row = createMockRequest({ buyerId: actor.id, buyerName: actor.name, kind: parsed.data.kind, productTitle: parsed.data.productTitle, quantity: parsed.data.quantity, destination: parsed.data.destination, contactPhone: parsed.data.contactPhone, message: parsed.data.message });
  return NextResponse.json({ request: row }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
