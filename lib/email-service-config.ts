/** Configuration SMTP lue dans l'environnement (aucun secret dans le dépôt). */
export type SmtpConfig = {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  password?: string;
  fromAddress: string;
  fromName?: string;
};


export function smtpConfigFromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const fromAddress = process.env.SMTP_FROM?.trim();
  if (!host || !fromAddress) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim() || undefined,
    password: process.env.SMTP_PASSWORD || undefined,
    fromAddress,
    fromName: process.env.SMTP_FROM_NAME?.trim() || "mybigmarket",
  };
}
