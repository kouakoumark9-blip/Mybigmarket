import { NextResponse } from "next/server";

export const revalidate = 21600;
const supportedCurrencies = ["XOF", "CVE", "GMD", "GHS", "GNF", "LRD", "MRU", "NGN", "SLE"] as const;

export async function GET() {
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/XOF", { next: { revalidate } });
    if (!response.ok) throw new Error("Exchange-rate service unavailable");
    const payload = await response.json() as { result?: string; base_code?: string; time_last_update_utc?: string; rates?: Record<string, number> };
    if (payload.result !== "success" || payload.base_code !== "XOF" || !payload.rates) throw new Error("Invalid exchange-rate response");
    const sourceRates = payload.rates;
    const rates = Object.fromEntries(supportedCurrencies.flatMap((currency) => Number.isFinite(sourceRates[currency]) ? [[currency, sourceRates[currency]]] : []));
    return NextResponse.json({ base: "XOF", rates, updatedAt: payload.time_last_update_utc || null, indicative: true }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ base: "XOF", rates: { XOF: 1 }, updatedAt: null, indicative: true, unavailable: true }, { status: 200, headers: { "Cache-Control": "public, s-maxage=900" } });
  }
}
