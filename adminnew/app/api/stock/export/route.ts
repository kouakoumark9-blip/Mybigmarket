import { NextResponse } from "next/server";
import { adminApiRaw, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Export CSV du stock : relaie le fichier de l'API pour l'employé connecté. */
export async function GET(request: Request) {
  await requireEmployee("catalog.export");
  const warehouseId = new URL(request.url).searchParams.get("warehouseId") ?? undefined;
  try {
    const response = await adminApiRaw("/admin/stock/export.csv", { warehouseId });
    return new NextResponse(response.body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": response.headers.get("content-disposition") ?? `attachment; filename="stock.csv"`, "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: apiErrorMessage(error) }, { status: 502 });
  }
}
