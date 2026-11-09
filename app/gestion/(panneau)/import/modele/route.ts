import { currentAdmin } from "@/lib/gestion/session";
import { CSV_EXAMPLE } from "@/lib/gestion/import";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentAdmin())) return new Response("Non autorisé", { status: 401 });
  return new Response(`﻿${CSV_EXAMPLE}\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="modele-produits.csv"', "cache-control": "no-store" } });
}
