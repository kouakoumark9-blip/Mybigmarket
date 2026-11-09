import { NextResponse } from "next/server";
import { listProducts } from "@/lib/shop/queries";

export const dynamic = "force-dynamic";

/** Produits publiés à partir d'une liste de slugs (favoris du visiteur). Lecture seule, publique. */
export async function GET(request: Request) {
  const slugs = (new URL(request.url).searchParams.get("slugs") ?? "").split(",").map((slug) => slug.trim()).filter((slug) => /^[a-z0-9-]{1,210}$/.test(slug)).slice(0, 40);
  if (!slugs.length) return NextResponse.json({ items: [] });
  const { items } = await listProducts({ slugs, limit: 40 });
  return NextResponse.json({ items }, { headers: { "cache-control": "no-store" } });
}
