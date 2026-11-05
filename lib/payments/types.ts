/**
 * Contrat commun des prestataires de paiement (étape 5).
 *
 * Un prestataire (« passerelle ») sait :
 *   - initialiser un paiement et renvoyer la page de paiement hébergée ou des consignes ;
 *   - lire une notification (webhook) et en vérifier la signature ;
 *   - vérifier l'état réel d'un paiement auprès de lui (source de vérité) ;
 *   - rembourser, automatiquement ou en signalant un remboursement manuel.
 *
 * Aucune donnée de carte ne passe par nos serveurs : la carte se saisit sur la page hébergée du
 * prestataire. Les clés d'API ne vivent que dans les variables d'environnement.
 */

export const PAYMENT_METHOD_CODES = ["orange_money", "mtn_momo", "moov_money", "wave", "card", "bank_transfer", "cash_on_delivery"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export type PaymentMethodKind = "mobile_money" | "card" | "bank_transfer" | "cash_on_delivery";

export const PAYMENT_METHOD_INFO: Record<PaymentMethodCode, { label: string; kind: PaymentMethodKind }> = {
  orange_money: { label: "Orange Money", kind: "mobile_money" },
  mtn_momo: { label: "MTN Mobile Money", kind: "mobile_money" },
  moov_money: { label: "Moov Money", kind: "mobile_money" },
  wave: { label: "Wave", kind: "mobile_money" },
  card: { label: "Carte bancaire", kind: "card" },
  bank_transfer: { label: "Virement bancaire", kind: "bank_transfer" },
  cash_on_delivery: { label: "Paiement à la livraison", kind: "cash_on_delivery" },
};

/** État d'un paiement tel que le prestataire le connaît. */
export type GatewayStatus = "pending" | "succeeded" | "failed" | "cancelled";

export type InitiateInput = {
  /** Référence de l'intention : identifiant de transaction unique transmis au prestataire. */
  reference: string;
  amountXof: number;
  currency: "XOF";
  method: PaymentMethodCode;
  description: string;
  customer: { firstName: string; lastName: string; email: string; phone?: string | null; address?: string | null; city?: string | null; countryCode: string };
  returnUrl: string;
  notifyUrl: string;
  language: "fr" | "en";
  /** Consignes préparées par le service (virement : coordonnées bancaires). */
  instructions?: Record<string, unknown>;
};

export type InitiateResult = {
  status: GatewayStatus;
  providerReference: string | null;
  /** Page de paiement hébergée par le prestataire. */
  checkoutUrl?: string | null;
  instructions?: Record<string, unknown>;
  /** Échange expurgé, pour le journal des transactions. */
  request: Record<string, unknown>;
  response: Record<string, unknown>;
};

export type WebhookInput = { rawBody: string; headers: Headers };

export type WebhookParseResult = {
  /** Signature (ou jeton) vérifiée avec le secret du prestataire. */
  signatureValid: boolean;
  /** Clé de déduplication : une notification identique rejouée garde la même clé. */
  eventKey: string;
  /** Référence de l'intention (identifiant de transaction que nous avons transmis). */
  reference: string | null;
  providerReference?: string | null;
  /** État annoncé par la notification, quand le prestataire le transmet. */
  status?: GatewayStatus;
  amountXof?: number;
  currency?: string;
  /**
   * Vrai quand l'état doit être confirmé par `check` (le prestataire ne garantit pas le contenu de la
   * notification, ou ne transmet pas l'état). C'est alors `check` qui fait foi.
   */
  needsConfirmation: boolean;
  /** Contenu expurgé, conservé dans la boîte de réception. */
  payload: Record<string, unknown>;
  error?: string;
};

export type CheckResult = {
  status: GatewayStatus;
  amountXof?: number;
  currency?: string;
  providerReference?: string | null;
  /** Moyen réellement utilisé sur la page du prestataire (ex. opérateur mobile). */
  usedMethod?: string | null;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
};

export type RefundInput = { reference: string; providerReference: string | null; amountXof: number; reason: string; refundReference: string };

export type RefundResult = {
  /** `manual` : le prestataire n'offre pas de remboursement par API, l'équipe le fait puis le confirme. */
  mode: "automatic" | "manual";
  status: "succeeded" | "processing" | "failed";
  providerReference?: string | null;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  error?: string;
};

export interface PaymentGateway {
  /** Clé stable, enregistrée sur l'intention (`mock`, `manual`, `cinetpay`). */
  readonly key: string;
  readonly label: string;
  supports(method: PaymentMethodCode): boolean;
  /** Identifiants présents dans l'environnement. */
  configured(): boolean;
  /** Les notifications de ce prestataire doivent-elles passer par `check` ? */
  readonly confirmsByCheck: boolean;
  /** Le prestataire envoie-t-il des notifications ? */
  readonly sendsWebhooks: boolean;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  parseWebhook(input: WebhookInput): WebhookParseResult;
  check(reference: string, providerReference: string | null): Promise<CheckResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}

/** Erreur côté prestataire (refus, indisponibilité) : message lisible et code technique. */
export class GatewayError extends Error {
  constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "GatewayError";
  }
}

const SECRET_KEYS = /^(apikey|api_key|secret|secret_key|password|token|authorization|x-token|signature|card|pan|cvv|cvc)$/i;

/**
 * Expurge un échange avant écriture au journal : clés et signatures retirées, numéros de carte
 * neutralisés, téléphones masqués (4 derniers chiffres conservés).
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redact(entry, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.test(key)) { out[key] = "[expurgé]"; continue; }
      if (/phone|cel_|msisdn/i.test(key) && typeof entry === "string") { out[key] = entry.length > 4 ? `${"•".repeat(Math.min(8, entry.length - 4))}${entry.slice(-4)}` : "••••"; continue; }
      out[key] = redact(entry, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    const masked = value.replace(/\b\d{13,19}\b/g, "[carte expurgée]");
    return masked.length > 2000 ? `${masked.slice(0, 2000)}…` : masked;
  }
  return value;
}

export const redacted = (value: unknown) => redact(value) as Record<string, unknown>;
