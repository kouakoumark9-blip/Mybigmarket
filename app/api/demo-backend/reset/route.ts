import { NextResponse } from "next/server";
import { resetMockRequests } from "@/lib/demo-backend";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
export async function POST() {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  return NextResponse.json({ requests: resetMockRequests() }, { headers: { "Cache-Control": "no-store" } });
}
