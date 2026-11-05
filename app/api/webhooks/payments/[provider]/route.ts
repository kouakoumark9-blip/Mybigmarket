import { db } from "@/server/core/db";
import { handleWebhook } from "@/server/modules/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notifications des prestataires de paiement : /api/webhooks/payments/{mock|cinetpay}.
 * Le corps brut est lu tel quel (la signature porte sur lui). Rejouée, une notification n'a aucun
 * nouvel effet ; signature invalide : 401 ; erreur temporaire : 5xx pour que le prestataire réessaie.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const rawBody = await request.text();
  try {
    const result = await handleWebhook(db(), provider, rawBody, request.headers);
    return Response.json(result.body, { status: result.httpStatus, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("payment_webhook_unhandled", error);
    return Response.json({ error: "Erreur de traitement." }, { status: 500 });
  }
}
