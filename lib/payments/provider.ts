import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type PayMethod = "orange_money" | "mtn_momo" | "wave" | "card";
export type PaymentResult = { provider: string; reference: string; status: "pending"; checkoutUrl?: string };

export interface PaymentProvider {
  createPayment(reference: string, amountXof: number, method: PayMethod): Promise<PaymentResult>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(reference: string, amountXof: number, method: PayMethod): Promise<PaymentResult> {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "true") {
      throw new Error("Le paiement mock est désactivé en production.");
    }
    if (!Number.isSafeInteger(amountXof) || amountXof < 1) throw new Error("Montant XOF invalide.");
    return { provider: `mock_${method}`, reference: `mock_${randomUUID()}`, status: "pending" };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_PAYMENTS !== "true") return false;
    const secret = process.env.MOCK_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}

export function getPaymentProvider(): PaymentProvider {
  // CinetPay/PayDunya adapter à ajouter ici après validation contractuelle de l’escrow.
  return new MockPaymentProvider();
}
