/**
 * Canaux d'envoi (étape 6) :
 *   - e-mail par SMTP (nodemailer) : SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_FROM_NAME ;
 *   - WhatsApp par l'API Cloud de Meta (messages modèles pré-approuvés) : WHATSAPP_ACCESS_TOKEN,
 *     WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION (facultatif).
 * Sans configuration, les messages restent en file et partent dès qu'elle est renseignée.
 */
import nodemailer from "nodemailer";
import { smtpConfigFromEnv } from "@/lib/email-service-config";

export type EmailMessage = { from: string; to: string; subject: string; html: string; text: string; replyTo?: string };
export interface EmailTransport { readonly name: string; send(message: EmailMessage): Promise<{ messageId: string | null }> }

export type WhatsAppMessage = { to: string; templateName: string; language: string; parameters: string[] };
export interface WhatsAppTransport { readonly name: string; send(message: WhatsAppMessage): Promise<{ messageId: string | null }> }

let emailOverride: EmailTransport | null | undefined;
let whatsappOverride: WhatsAppTransport | null | undefined;

/** Tests : remplace les transports (null = non configuré, undefined = configuration réelle). */
export function setTransportsForTests(transports: { email?: EmailTransport | null; whatsapp?: WhatsAppTransport | null }) {
  if ("email" in transports) emailOverride = transports.email;
  if ("whatsapp" in transports) whatsappOverride = transports.whatsapp;
}

export function emailSender(): { address: string; name: string } | null {
  const config = smtpConfigFromEnv();
  if (emailOverride) return { address: process.env.SMTP_FROM || "boutique@exemple.test", name: process.env.SMTP_FROM_NAME || "mybigmarket" };
  return config ? { address: config.fromAddress, name: config.fromName ?? "mybigmarket" } : null;
}

let smtpCache: { key: string; transport: EmailTransport } | null = null;

export function emailTransport(): EmailTransport | null {
  if (emailOverride !== undefined) return emailOverride;
  const config = smtpConfigFromEnv();
  if (!config) return null;
  const key = `${config.host}:${config.port}:${config.user ?? ""}:${config.secure ? "s" : "p"}`;
  if (smtpCache?.key === key) return smtpCache.transport;
  const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure ?? config.port === 465, auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined });
  smtpCache = {
    key,
    transport: {
      name: "smtp",
      async send(message) {
        const info = await transporter.sendMail({ from: message.from, to: message.to, subject: message.subject, html: message.html, text: message.text, replyTo: message.replyTo });
        return { messageId: info.messageId ?? null };
      },
    },
  };
  return smtpCache.transport;
}

/** API Cloud de WhatsApp (Meta) : messages modèles, seuls autorisés hors fenêtre de conversation de 24 h. */
export class MetaWhatsAppTransport implements WhatsAppTransport {
  readonly name = "whatsapp-cloud";
  constructor(private readonly token: string, private readonly phoneNumberId: string, private readonly version = "v21.0", private readonly fetcher: typeof fetch = fetch) {}

  async send(message: WhatsAppMessage) {
    const response = await this.fetcher(`https://graph.facebook.com/${this.version}/${encodeURIComponent(this.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: message.to.replace(/^\+/, ""), type: "template",
        template: { name: message.templateName, language: { code: message.language }, components: message.parameters.length ? [{ type: "body", parameters: message.parameters.map((text) => ({ type: "text", text: text.slice(0, 1000) })) }] : [] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(`WhatsApp ${response.status} : ${json.error?.message ?? "refusé"}`);
    return { messageId: json.messages?.[0]?.id ?? null };
  }
}

export function whatsappTransport(): WhatsAppTransport | null {
  if (whatsappOverride !== undefined) return whatsappOverride;
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return new MetaWhatsAppTransport(token, phoneNumberId, process.env.WHATSAPP_API_VERSION?.trim() || "v21.0");
}

/** Numéro international (E.164) à partir d'un numéro saisi, avec l'indicatif du pays si absent. */
export function toE164(phone: string | null | undefined, callingCode = "+225"): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : null;
  if (digits.startsWith("00")) return /^\d{10,17}$/.test(digits) ? `+${digits.slice(2)}` : null;
  const code = callingCode.replace(/^\+/, "");
  // Côte d'Ivoire et Bénin : le 0 initial fait partie du numéro à 10 chiffres ; ailleurs, préfixe national retiré.
  const local = ["225", "229"].includes(code) ? digits : digits.replace(/^0/, "");
  const full = `+${code}${local}`;
  return /^\+\d{8,15}$/.test(full) ? full : null;
}
