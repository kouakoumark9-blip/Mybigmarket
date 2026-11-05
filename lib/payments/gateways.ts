/**
 * Prestataires de paiement disponibles :
 *   - `mock`     : développement et tests, notifications signées par MOCK_WEBHOOK_SECRET ;
 *                  refusé en production sauf ALLOW_MOCK_PAYMENTS=true ;
 *   - `manual`   : virement bancaire et paiement à la livraison, confirmés par l'équipe ;
 *   - `cinetpay` : agrégateur (Orange Money, MTN, Moov, Wave, carte) sur page hébergée.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  GatewayError, redacted, type CheckResult, type GatewayStatus, type InitiateInput, type InitiateResult, type PaymentGateway,
  type PaymentMethodCode, type RefundInput, type RefundResult, type WebhookInput, type WebhookParseResult,
} from "./types";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function safeEqualHex(expected: string, received: string): boolean {
  if (!received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export const mockPaymentsAllowed = () => process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "true";

/* ─────────────────────────────  Mock  ───────────────────────────── */

const MOCK_STATUS: Record<string, GatewayStatus> = { paid: "succeeded", succeeded: "succeeded", failed: "failed", pending: "pending", cancelled: "cancelled" };

/** État « distant » simulé, pour exercer la vérification et le rapprochement en développement. */
const mockRemote = new Map<string, { status: GatewayStatus; amountXof: number }>();

export class MockGateway implements PaymentGateway {
  readonly key = "mock";
  readonly label = "Paiement simulé";
  readonly confirmsByCheck = false;
  readonly sendsWebhooks = true;

  static setRemoteStatus(reference: string, status: GatewayStatus, amountXof: number) { mockRemote.set(reference, { status, amountXof }); }
  static resetRemote() { mockRemote.clear(); }

  supports(method: PaymentMethodCode) { return !["bank_transfer", "cash_on_delivery"].includes(method); }
  configured() { return mockPaymentsAllowed(); }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (!mockPaymentsAllowed()) throw new GatewayError("disabled", "Le paiement simulé est désactivé en production.");
    if (!Number.isSafeInteger(input.amountXof) || input.amountXof < 1) throw new GatewayError("invalid_amount", "Montant XOF invalide.");
    const providerReference = `mock_${randomUUID()}`;
    return { status: "pending", providerReference, checkoutUrl: null, request: redacted({ reference: input.reference, amount: input.amountXof, method: input.method }), response: { providerReference } };
  }

  parseWebhook({ rawBody, headers }: WebhookInput): WebhookParseResult {
    const secret = process.env.MOCK_WEBHOOK_SECRET;
    const signature = headers.get("x-afm-signature") || "";
    const signatureValid = mockPaymentsAllowed() && Boolean(secret) && safeEqualHex(createHmac("sha256", secret!).update(rawBody).digest("hex"), signature);
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return { signatureValid, eventKey: `sha:${sha256(rawBody)}`, reference: null, needsConfirmation: false, payload: {}, error: "JSON invalide" }; }
    const eventKey = typeof body.eventId === "string" && body.eventId ? `evt:${body.eventId.slice(0, 120)}` : `sha:${sha256(rawBody)}`;
    return {
      signatureValid, eventKey,
      reference: typeof body.reference === "string" ? body.reference : null,
      providerReference: typeof body.providerReference === "string" ? body.providerReference : null,
      status: typeof body.status === "string" ? MOCK_STATUS[body.status] : undefined,
      amountXof: Number.isInteger(body.amountXof) ? (body.amountXof as number) : undefined,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      needsConfirmation: false,
      payload: redacted(body),
    };
  }

  async check(reference: string): Promise<CheckResult> {
    const remote = mockRemote.get(reference);
    return { status: remote?.status ?? "pending", amountXof: remote?.amountXof, currency: "XOF", request: { reference }, response: remote ? { ...remote } : { status: "unknown" } };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { mode: "automatic", status: "succeeded", providerReference: `mock_refund_${randomUUID()}`, request: redacted(input), response: { status: "succeeded" } };
  }
}

/* ─────────────────────────────  Manuel  ───────────────────────────── */

export class ManualGateway implements PaymentGateway {
  readonly key = "manual";
  readonly label = "Encaissement manuel";
  readonly confirmsByCheck = false;
  readonly sendsWebhooks = false;

  supports(method: PaymentMethodCode) { return method === "bank_transfer" || method === "cash_on_delivery"; }
  configured() { return true; }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    return { status: "pending", providerReference: null, checkoutUrl: null, instructions: input.instructions ?? {}, request: redacted({ reference: input.reference, amount: input.amountXof, method: input.method }), response: { status: "awaiting_manual_confirmation" } };
  }

  parseWebhook({ rawBody }: WebhookInput): WebhookParseResult {
    return { signatureValid: false, eventKey: `sha:${sha256(rawBody)}`, reference: null, needsConfirmation: false, payload: {}, error: "Aucune notification attendue pour un encaissement manuel." };
  }

  async check(reference: string): Promise<CheckResult> {
    return { status: "pending", request: { reference }, response: { status: "awaiting_manual_confirmation" } };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    return { mode: "manual", status: "processing", request: redacted(input), response: { status: "manual_refund_required" } };
  }
}

/* ─────────────────────────────  CinetPay  ───────────────────────────── */

/**
 * Agrégateur CinetPay (API « checkout » v2) : page de paiement hébergée, notification de fin de
 * paiement, vérification par API. La notification ne transporte pas d'état fiable : l'état fait foi
 * seulement après l'appel de vérification (`check`), authentifié par notre clé d'API.
 *
 * Variables : CINETPAY_API_KEY, CINETPAY_SITE_ID, CINETPAY_SECRET_KEY (jeton HMAC des notifications),
 * CINETPAY_API_BASE (facultatif). À valider en mode test avec le compte marchand avant activation.
 */
const CINETPAY_CHANNELS: Partial<Record<PaymentMethodCode, string>> = {
  orange_money: "MOBILE_MONEY", mtn_momo: "MOBILE_MONEY", moov_money: "MOBILE_MONEY", wave: "WALLET", card: "CREDIT_CARD",
};

/** Ordre des champs du jeton HMAC (`x-token`) des notifications CinetPay. */
const CINETPAY_TOKEN_FIELDS = [
  "cpm_site_id", "cpm_trans_id", "cpm_trans_date", "cpm_amount", "cpm_currency", "signature", "payment_method", "cel_phone_num",
  "cpm_phone_prefixe", "cpm_language", "cpm_version", "cpm_payment_config", "cpm_page_action", "cpm_custom", "cpm_designation", "cpm_error_message",
];

const CINETPAY_STATUS: Record<string, GatewayStatus> = { ACCEPTED: "succeeded", REFUSED: "failed", CANCELED: "cancelled", CANCELLED: "cancelled" };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class CinetPayGateway implements PaymentGateway {
  readonly key = "cinetpay";
  readonly label = "CinetPay";
  readonly confirmsByCheck = true;
  readonly sendsWebhooks = true;

  constructor(private readonly fetcher: FetchLike = (input, init) => fetch(input, init)) {}

  private get base() { return (process.env.CINETPAY_API_BASE || "https://api-checkout.cinetpay.com/v2").replace(/\/+$/, ""); }
  private get apiKey() { return process.env.CINETPAY_API_KEY?.trim() || ""; }
  private get siteId() { return process.env.CINETPAY_SITE_ID?.trim() || ""; }

  supports(method: PaymentMethodCode) { return method in CINETPAY_CHANNELS; }
  configured() { return Boolean(this.apiKey && this.siteId); }

  private async post(path: string, body: Record<string, unknown>) {
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}${path}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      throw new GatewayError("unreachable", "Le prestataire de paiement ne répond pas. Réessayez dans un instant.", { cause: error instanceof Error ? error.message : String(error) });
    }
    let json: Record<string, unknown> = {};
    try { json = (await response.json()) as Record<string, unknown>; } catch { /* réponse non JSON */ }
    return { httpStatus: response.status, json };
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (!this.configured()) throw new GatewayError("not_configured", "CinetPay n'est pas configuré.");
    const channels = CINETPAY_CHANNELS[input.method];
    if (!channels) throw new GatewayError("unsupported_method", "Moyen de paiement non pris en charge par CinetPay.");
    const body = {
      apikey: this.apiKey, site_id: this.siteId, transaction_id: input.reference, amount: input.amountXof, currency: input.currency,
      description: input.description.replace(/[^\p{L}\p{N} .,'-]/gu, " ").slice(0, 120), notify_url: input.notifyUrl, return_url: input.returnUrl,
      channels, lang: input.language, metadata: input.reference,
      customer_name: input.customer.lastName || input.customer.firstName, customer_surname: input.customer.firstName || input.customer.lastName,
      customer_email: input.customer.email, customer_phone_number: input.customer.phone ?? "", customer_address: input.customer.address ?? "",
      customer_city: input.customer.city ?? "", customer_country: input.customer.countryCode, customer_state: input.customer.countryCode, customer_zip_code: "00000",
    };
    const { httpStatus, json } = await this.post("/payment", body);
    const data = (json.data ?? {}) as Record<string, unknown>;
    if (String(json.code) !== "201" || typeof data.payment_url !== "string") {
      throw new GatewayError("refused", `Le prestataire a refusé l'initialisation du paiement (${String(json.description ?? json.message ?? httpStatus)}).`, { response: redacted(json) });
    }
    return { status: "pending", providerReference: typeof data.payment_token === "string" ? data.payment_token : null, checkoutUrl: data.payment_url, request: redacted(body), response: redacted(json) };
  }

  parseWebhook({ rawBody, headers }: WebhookInput): WebhookParseResult {
    const params = new URLSearchParams(rawBody);
    const fields: Record<string, string> = {};
    for (const [key, value] of params) fields[key] = value;
    const secret = process.env.CINETPAY_SECRET_KEY?.trim();
    const token = headers.get("x-token") || "";
    const expected = secret ? createHmac("sha256", secret).update(CINETPAY_TOKEN_FIELDS.map((field) => fields[field] ?? "").join("")).digest("hex") : "";
    const sameSite = Boolean(fields.cpm_site_id) && fields.cpm_site_id === this.siteId;
    const signatureValid = Boolean(secret) && sameSite && safeEqualHex(expected, token);
    const reference = fields.cpm_trans_id || null;
    const amount = Number.parseInt(fields.cpm_amount ?? "", 10);
    return {
      signatureValid,
      // Une même notification renvoyée garde la même clé ; un changement de contenu est retraité (sans effet si rien n'a changé).
      eventKey: `${(reference ?? "inconnu").slice(0, 100)}:${sha256(rawBody).slice(0, 32)}`,
      reference,
      amountXof: Number.isFinite(amount) ? amount : undefined,
      currency: fields.cpm_currency,
      needsConfirmation: true,
      payload: redacted(fields),
      error: !sameSite ? "Site marchand inattendu." : undefined,
    };
  }

  async check(reference: string): Promise<CheckResult> {
    if (!this.configured()) throw new GatewayError("not_configured", "CinetPay n'est pas configuré.");
    const body = { apikey: this.apiKey, site_id: this.siteId, transaction_id: reference };
    const { json } = await this.post("/payment/check", body);
    const data = (json.data ?? {}) as Record<string, unknown>;
    const rawStatus = String(data.status ?? "").toUpperCase();
    const amount = Number.parseInt(String(data.amount ?? ""), 10);
    return {
      status: CINETPAY_STATUS[rawStatus] ?? "pending",
      amountXof: Number.isFinite(amount) ? amount : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
      providerReference: typeof data.operator_id === "string" ? data.operator_id : null,
      usedMethod: typeof data.payment_method === "string" ? data.payment_method : null,
      request: redacted(body),
      response: redacted(json),
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    // L'API checkout ne propose pas de remboursement : il se fait depuis l'espace marchand, puis l'équipe le confirme.
    return { mode: "manual", status: "processing", request: redacted(input), response: { status: "manual_refund_required", via: "espace marchand CinetPay" } };
  }
}

export { CINETPAY_TOKEN_FIELDS };
