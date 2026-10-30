import { NextResponse } from "next/server";
import { z } from "zod";
import { getMockStorefrontForSeller, MOCK_ACTORS, saveMockStorefront } from "@/lib/demo-backend";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
const settingsSchema = z.object({
  sellerId: z.string().min(1),
  storeName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  headline: z.string().trim().min(3).max(190),
  description: z.string().trim().max(1500),
  announcement: z.string().trim().max(200),
  isPublished: z.boolean(),
});

export async function GET(request: Request) {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  const sellerId = new URL(request.url).searchParams.get("sellerId") || "";
  if (!MOCK_ACTORS.seller.some((actor) => actor.id === sellerId)) return NextResponse.json({ error: "Profil vendeur fictif invalide." }, { status: 400 });
  const storefront = getMockStorefrontForSeller(sellerId);
  return storefront ? NextResponse.json({ storefront }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Boutique fictive introuvable." }, { status: 404 });
}

export async function PUT(request: Request) {
  if (!isDemoBackendEnabled()) return NextResponse.json({ error: "Démo indisponible en production." }, { status: 404 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vérifiez les réglages de la boutique." }, { status: 400 });
  if (!MOCK_ACTORS.seller.some((actor) => actor.id === parsed.data.sellerId)) return NextResponse.json({ error: "Profil vendeur fictif invalide." }, { status: 403 });
  const storefront = saveMockStorefront(parsed.data.sellerId, {
    slug: parsed.data.slug, storeName: parsed.data.storeName, headline: parsed.data.headline,
    description: parsed.data.description, announcement: parsed.data.announcement, isPublished: parsed.data.isPublished,
  });
  if (!storefront) return NextResponse.json({ error: "Adresse de boutique déjà prise ou profil introuvable." }, { status: 409 });
  return NextResponse.json({ storefront }, { headers: { "Cache-Control": "no-store" } });
}
