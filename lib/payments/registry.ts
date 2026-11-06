import "server-only";
import { CinetPayGateway, GeniusPayGateway, ManualGateway, MockGateway } from "./gateways";
import type { PaymentGateway, PaymentMethodCode } from "./types";

/**
 * Choix du prestataire pour un moyen de paiement :
 *   - virement et paiement à la livraison : encaissement manuel ;
 *   - mobile money et carte : GeniusPay ou CinetPay s'ils sont configurés, sinon le paiement simulé hors production.
 * Sans prestataire, le moyen n'est simplement pas proposé.
 */
const registry: Record<string, PaymentGateway> = {
  mock: new MockGateway(),
  manual: new ManualGateway(),
  cinetpay: new CinetPayGateway(),
  geniuspay: new GeniusPayGateway(),
};

export function gatewayByKey(key: string): PaymentGateway | null {
  return registry[key] ?? null;
}

export function gatewayForMethod(method: PaymentMethodCode): PaymentGateway | null {
  if (method === "bank_transfer" || method === "cash_on_delivery") return registry.manual;
  const preferred = [registry.geniuspay, registry.cinetpay, registry.mock];
  return preferred.find((gateway) => gateway.supports(method) && gateway.configured()) ?? null;
}

/** Remplace un prestataire (tests uniquement). */
export function setGatewayForTests(key: string, gateway: PaymentGateway) {
  registry[key] = gateway;
}
