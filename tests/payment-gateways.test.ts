import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CINETPAY_TOKEN_FIELDS, CinetPayGateway, GeniusPayGateway, ManualGateway, MockGateway } from "@/lib/payments/gateways";
import { gatewayForMethod } from "@/lib/payments/registry";
import { GatewayError, redact, type InitiateInput } from "@/lib/payments/types";

afterEach(() => { vi.unstubAllEnvs(); });

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

const initiateInput: InitiateInput = {
  reference: "PAY-20261105-ABCDEF12", amountXof: 23_600, currency: "XOF", method: "orange_money", description: "Commande CMD-2026-000001",
  customer: { firstName: "Awa", lastName: "Koné", email: "awa@example.com", phone: "+2250700000000", address: "Rue 12", city: "Abidjan", countryCode: "CI" },
  returnUrl: "https://boutique.test/paiement/retour", notifyUrl: "https://boutique.test/api/webhooks/payments/cinetpay", language: "fr",
};

describe("expurgation du journal", () => {
  it("retire clés et signatures, neutralise les numéros de carte et masque les téléphones", () => {
    const out = redact({ apikey: "k", secret_key: "s", nested: { signature: "x", note: "carte 4111111111111111" }, customer_phone_number: "+2250700001234" }) as { apikey: string; secret_key: string; nested: { signature: string; note: string }; customer_phone_number: string };
    expect(out.apikey).toBe("[expurgé]");
    expect(out.secret_key).toBe("[expurgé]");
    expect(out.nested.signature).toBe("[expurgé]");
    expect(out.nested.note).toBe("carte [carte expurgée]");
    expect(out.customer_phone_number.endsWith("1234")).toBe(true);
    expect(out.customer_phone_number).not.toContain("0700");
  });
});

describe("paiement simulé", () => {
  it("vérifie la signature HMAC et dérive une clé d'événement stable", () => {
    vi.stubEnv("MOCK_WEBHOOK_SECRET", "secret-de-test");
    const gateway = new MockGateway();
    const body = JSON.stringify({ eventId: "evt-1", reference: "PAY-1", status: "paid", amountXof: 1000, currency: "XOF" });
    const ok = gateway.parseWebhook({ rawBody: body, headers: new Headers({ "x-afm-signature": sign("secret-de-test", body) }) });
    expect(ok).toMatchObject({ signatureValid: true, eventKey: "evt:evt-1", reference: "PAY-1", status: "succeeded", amountXof: 1000, needsConfirmation: false });
    const forged = gateway.parseWebhook({ rawBody: body, headers: new Headers({ "x-afm-signature": sign("autre-secret", body) }) });
    expect(forged.signatureValid).toBe(false);
    const unsigned = gateway.parseWebhook({ rawBody: body, headers: new Headers() });
    expect(unsigned.signatureValid).toBe(false);
  });

  it("est refusé en production sauf autorisation explicite", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOCK_WEBHOOK_SECRET", "secret-de-test");
    const gateway = new MockGateway();
    await expect(gateway.initiate(initiateInput)).rejects.toBeInstanceOf(GatewayError);
    const body = "{}";
    expect(gateway.parseWebhook({ rawBody: body, headers: new Headers({ "x-afm-signature": sign("secret-de-test", body) }) }).signatureValid).toBe(false);
    vi.stubEnv("ALLOW_MOCK_PAYMENTS", "true");
    await expect(gateway.initiate(initiateInput)).resolves.toMatchObject({ status: "pending" });
  });
});

describe("encaissement manuel", () => {
  it("renvoie les consignes et signale un remboursement manuel", async () => {
    const gateway = new ManualGateway();
    const result = await gateway.initiate({ ...initiateInput, method: "bank_transfer", instructions: { iban: "CI00 0000" } });
    expect(result).toMatchObject({ status: "pending", instructions: { iban: "CI00 0000" } });
    expect(gateway.supports("orange_money")).toBe(false);
    await expect(gateway.refund({ reference: "PAY-1", providerReference: null, amountXof: 100, reason: "test", refundReference: "REM-1" })).resolves.toMatchObject({ mode: "manual", status: "processing" });
  });
});

describe("CinetPay", () => {
  const configure = () => {
    vi.stubEnv("CINETPAY_API_KEY", "cle-api");
    vi.stubEnv("CINETPAY_SITE_ID", "123456");
    vi.stubEnv("CINETPAY_SECRET_KEY", "cle-secrete");
  };

  it("initialise un paiement sur page hébergée sans exposer la clé au journal", async () => {
    configure();
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const gateway = new CinetPayGateway(async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ code: "201", message: "CREATED", data: { payment_token: "tok_1", payment_url: "https://checkout.cinetpay.test/p/tok_1" } }));
    });
    const result = await gateway.initiate(initiateInput);
    expect(calls[0].url).toBe("https://api-checkout.cinetpay.com/v2/payment");
    expect(calls[0].body).toMatchObject({ apikey: "cle-api", site_id: "123456", transaction_id: initiateInput.reference, amount: 23_600, currency: "XOF", channels: "MOBILE_MONEY" });
    expect(result).toMatchObject({ status: "pending", providerReference: "tok_1", checkoutUrl: "https://checkout.cinetpay.test/p/tok_1" });
    expect(result.request.apikey).toBe("[expurgé]");
  });

  it("transforme un refus du prestataire en erreur lisible", async () => {
    configure();
    const gateway = new CinetPayGateway(async () => new Response(JSON.stringify({ code: "608", message: "MINIMUM_REQUIRED_FIELDS", description: "champs manquants" }), { status: 400 }));
    await expect(gateway.initiate(initiateInput)).rejects.toMatchObject({ code: "refused" });
    const down = new CinetPayGateway(async () => { throw new Error("ECONNRESET"); });
    await expect(down.initiate(initiateInput)).rejects.toMatchObject({ code: "unreachable" });
  });

  it("vérifie le jeton HMAC des notifications et exige une vérification par API", () => {
    configure();
    const gateway = new CinetPayGateway();
    const fields: Record<string, string> = { cpm_site_id: "123456", cpm_trans_id: "PAY-1", cpm_trans_date: "2026-11-05 10:00:00", cpm_amount: "23600", cpm_currency: "XOF", signature: "sig", payment_method: "OM", cel_phone_num: "0700000000", cpm_phone_prefixe: "225", cpm_language: "fr", cpm_version: "V4", cpm_payment_config: "SINGLE", cpm_page_action: "PAYMENT", cpm_custom: "", cpm_designation: "Commande", cpm_error_message: "SUCCES" };
    const rawBody = new URLSearchParams(fields).toString();
    const token = createHmac("sha256", "cle-secrete").update(CINETPAY_TOKEN_FIELDS.map((field) => fields[field] ?? "").join("")).digest("hex");
    const ok = gateway.parseWebhook({ rawBody, headers: new Headers({ "x-token": token }) });
    expect(ok).toMatchObject({ signatureValid: true, reference: "PAY-1", amountXof: 23_600, needsConfirmation: true });
    expect((ok.payload as Record<string, string>).signature).toBe("[expurgé]");
    expect(gateway.parseWebhook({ rawBody, headers: new Headers({ "x-token": "0".repeat(64) }) }).signatureValid).toBe(false);
    const otherSite = new URLSearchParams({ ...fields, cpm_site_id: "999" }).toString();
    expect(gateway.parseWebhook({ rawBody: otherSite, headers: new Headers({ "x-token": token }) }).signatureValid).toBe(false);
    // Rejouée à l'identique : même clé ; contenu différent : nouvelle clé.
    expect(gateway.parseWebhook({ rawBody, headers: new Headers() }).eventKey).toBe(ok.eventKey);
    expect(gateway.parseWebhook({ rawBody: `${rawBody}&x=1`, headers: new Headers() }).eventKey).not.toBe(ok.eventKey);
  });

  it("lit l'état réel par l'API de vérification", async () => {
    configure();
    const answer = (status: string) => new CinetPayGateway(async () => new Response(JSON.stringify({ code: "00", message: "SUCCES", data: { amount: "23600", currency: "XOF", status, payment_method: "OMCIV2", operator_id: "OP-1" } })));
    await expect(answer("ACCEPTED").check("PAY-1")).resolves.toMatchObject({ status: "succeeded", amountXof: 23_600, usedMethod: "OMCIV2", providerReference: "OP-1" });
    await expect(answer("REFUSED").check("PAY-1")).resolves.toMatchObject({ status: "failed" });
    await expect(answer("WAITING_CUSTOMER_PAYMENT").check("PAY-1")).resolves.toMatchObject({ status: "pending" });
  });
});

describe("choix du prestataire", () => {
  it("virement et paiement à la livraison : manuel ; mobile money : CinetPay s'il est configuré, sinon simulé hors production", () => {
    expect(gatewayForMethod("bank_transfer")?.key).toBe("manual");
    expect(gatewayForMethod("cash_on_delivery")?.key).toBe("manual");
    expect(gatewayForMethod("wave")?.key).toBe("mock");
    vi.stubEnv("CINETPAY_API_KEY", "cle-api");
    vi.stubEnv("CINETPAY_SITE_ID", "123456");
    expect(gatewayForMethod("wave")?.key).toBe("cinetpay");
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    expect(gatewayForMethod("card")).toBeNull();
  });
});

describe("GeniusPay", () => {
  const configure = () => {
    vi.stubEnv("GENIUSPAY_API_KEY", "pk_test_x");
    vi.stubEnv("GENIUSPAY_API_SECRET", "sk_test_y");
    vi.stubEnv("GENIUSPAY_WEBHOOK_SECRET", "whsec_z");
  };

  it("initialise un paiement avec les en-têtes d'API et renvoie la page hébergée", async () => {
    configure();
    const calls: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];
    const gateway = new GeniusPayGateway(async (url, init) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ success: true, data: { reference: "MTX-1", checkout_url: "https://geniuspay.test/pay/MTX-1" } }), { status: 201 });
    });
    const result = await gateway.initiate({ ...initiateInput, method: "wave" });
    expect(calls[0].url).toBe("https://geniuspay.ci/api/v1/merchant/payments");
    expect(calls[0].headers["X-API-Key"]).toBe("pk_test_x");
    expect(calls[0].body).toMatchObject({ amount: 23_600, currency: "XOF", payment_method: "wave", metadata: { intent_reference: initiateInput.reference } });
    expect(result).toMatchObject({ status: "pending", providerReference: "MTX-1", checkoutUrl: "https://geniuspay.test/pay/MTX-1" });
    // Moov : page hébergée, sans moyen imposé.
    await gateway.initiate({ ...initiateInput, method: "moov_money" });
    expect(calls[1].body.payment_method).toBeUndefined();
  });

  it("transforme un refus ou une panne en erreur lisible", async () => {
    configure();
    const refused = new GeniusPayGateway(async () => new Response(JSON.stringify({ error: { message: "montant trop bas" } }), { status: 422 }));
    await expect(refused.initiate(initiateInput)).rejects.toMatchObject({ code: "refused" });
    const down = new GeniusPayGateway(async () => { throw new Error("ECONNRESET"); });
    await expect(down.initiate(initiateInput)).rejects.toMatchObject({ code: "unreachable" });
  });

  it("vérifie la signature horodatée des notifications", () => {
    configure();
    const gateway = new GeniusPayGateway();
    const rawBody = JSON.stringify({ event: "payment.success", data: { reference: "MTX-1", amount: 23600, currency: "XOF", status: "completed", metadata: { intent_reference: "PAY-1" } } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", "whsec_z").update(`${ts}.${rawBody}`).digest("hex");
    const ok = gateway.parseWebhook({ rawBody, headers: new Headers({ "x-webhook-signature": sig, "x-webhook-timestamp": ts, "x-webhook-event": "payment.success" }) });
    expect(ok).toMatchObject({ signatureValid: true, reference: "PAY-1", amountXof: 23_600, needsConfirmation: true });
    expect(gateway.parseWebhook({ rawBody, headers: new Headers({ "x-webhook-signature": "0".repeat(64), "x-webhook-timestamp": ts }) }).signatureValid).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const oldSig = createHmac("sha256", "whsec_z").update(`${old}.${rawBody}`).digest("hex");
    expect(gateway.parseWebhook({ rawBody, headers: new Headers({ "x-webhook-signature": oldSig, "x-webhook-timestamp": old }) }).signatureValid).toBe(false);
  });

  it("lit l'état réel du paiement", async () => {
    configure();
    const answer = (status: string) => new GeniusPayGateway(async () => new Response(JSON.stringify({ data: { reference: "MTX-1", amount: 23600, currency: "XOF", status, payment_method: "wave" } })));
    expect((await answer("completed").check("PAY-1", "MTX-1")).status).toBe("succeeded");
    expect((await answer("expired").check("PAY-1", "MTX-1")).status).toBe("cancelled");
    expect((await answer("failed").check("PAY-1", "MTX-1")).status).toBe("failed");
    expect((await answer("processing").check("PAY-1", "MTX-1")).status).toBe("pending");
  });
});
