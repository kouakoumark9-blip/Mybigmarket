import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailLog, emailQueue, emailTemplates } from "@/lib/db/schema";
import { renderEmail, type EmailVariables } from "@/lib/email-render";

/**
 * Envoi d'e-mails (module 11).
 *
 * Règle structurante : aucun e-mail n'est envoyé dans la transaction métier.
 * On écrit en file (`email_queue`) et un traitement séparé envoie. Un SMTP lent
 * ou indisponible ne doit jamais faire échouer une commande.
 */

export { smtpConfigFromEnv, type SmtpConfig } from "@/lib/email-service-config";
import { smtpConfigFromEnv, type SmtpConfig } from "@/lib/email-service-config";

const MAX_ATTEMPTS = 3;

let cachedTransporter: { key: string; transporter: Transporter } | null = null;

function transporterFor(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user ?? ""}:${config.secure ? "s" : "p"}`;
  if (cachedTransporter?.key === key) return cachedTransporter.transporter;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? config.port === 465,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
  });
  cachedTransporter = { key, transporter };
  return transporter;
}

/** Met un e-mail en file. Ne fait aucun appel réseau. */
export async function enqueueEmail(input: {
  to: string;
  templateCode?: string;
  subject: string;
  html: string;
  payload?: Record<string, unknown>;
}): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .insert(emailQueue)
    .values({
      toAddress: input.to.slice(0, 190),
      templateCode: input.templateCode ?? null,
      subject: input.subject.slice(0, 240),
      bodyHtml: input.html,
      payload: input.payload ?? {},
    })
    .returning({ id: emailQueue.id });
  return row?.id ?? null;
}

/** Rend le modèle actif puis met l'e-mail en file. */
export async function queueTemplateEmail(code: string, to: string, variables: EmailVariables, locale = "fr"): Promise<string | null> {
  const db = getDb();
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.code, code), eq(emailTemplates.locale, locale), eq(emailTemplates.isActive, true)))
    .limit(1);
  if (!template) return null;
  const rendered = renderEmail(template, variables);
  return enqueueEmail({ to, templateCode: code, subject: rendered.subject, html: rendered.html, payload: { locale } });
}

export type SendResult = { sent: boolean; skipped?: string; error?: string };

/** Envoie un e-mail unique (utilisé par le bouton « test d'envoi » de l'admin). */
export async function sendDirect(config: SmtpConfig | null, input: { to: string; subject: string; html: string; employeeId?: string }): Promise<SendResult> {
  const db = getDb();
  if (!config) {
    await db.insert(emailLog).values({ toAddress: input.to, subject: input.subject, provider: "smtp", status: "skipped_no_config", error: "SMTP non configuré", employeeId: input.employeeId ?? null });
    return { sent: false, skipped: "no_config" };
  }
  try {
    await transporterFor(config).sendMail({
      from: config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    await db.insert(emailLog).values({ toAddress: input.to, subject: input.subject, provider: "smtp", status: "sent", employeeId: input.employeeId ?? null });
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi impossible";
    await db.insert(emailLog).values({ toAddress: input.to, subject: input.subject, provider: "smtp", status: "failed", error: message.slice(0, 500), employeeId: input.employeeId ?? null });
    return { sent: false, error: message };
  }
}

/**
 * Traite la file : réclame un lot, envoie, met à jour le statut.
 * `FOR UPDATE SKIP LOCKED` évite que deux exécutions traitent le même e-mail.
 */
export async function processEmailQueue(limit = 20): Promise<{ processed: number; sent: number; failed: number; skipped?: string }> {
  const config = smtpConfigFromEnv();
  if (!config) return { processed: 0, sent: 0, failed: 0, skipped: "no_config" };

  const db = getDb();
  // Réclamation atomique du lot : une seule requête, aucun ID interpolé.
  // `FOR UPDATE SKIP LOCKED` empêche deux exécutions concurrentes de traiter le même e-mail.
  type ClaimedRow = { id: string; to_address: string; subject: string; body_html: string };
  const claimRows = await db.execute<ClaimedRow>(sql`
    WITH picked AS (
      SELECT id FROM email_queue
      WHERE status = 'pending' AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE email_queue AS queue
    SET status = 'sending'
    FROM picked
    WHERE queue.id = picked.id
    RETURNING queue.id, queue.to_address, queue.subject, queue.body_html
  `);
  const claimed = (claimRows as unknown as ClaimedRow[]) ?? [];

  let sent = 0;
  let failed = 0;
  const transporter = transporterFor(config);

  for (const row of claimed) {
    try {
      await transporter.sendMail({
        from: config.fromName ? `"${config.fromName}" <${config.fromAddress}>` : config.fromAddress,
        to: row.to_address,
        subject: row.subject,
        html: row.body_html,
      });
      await db.update(emailQueue).set({ status: "sent", sentAt: new Date(), attempts: sql`${emailQueue.attempts} + 1` }).where(eq(emailQueue.id, row.id));
      await db.insert(emailLog).values({ queueId: row.id, toAddress: row.to_address, subject: row.subject, status: "sent" });
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Envoi impossible";
      const [current] = await db.select({ attempts: emailQueue.attempts }).from(emailQueue).where(eq(emailQueue.id, row.id)).limit(1);
      const attempts = (current?.attempts ?? 0) + 1;
      await db.update(emailQueue).set({
        attempts,
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        lastError: message.slice(0, 500),
        // Reprise différée de 5 minutes, pour ne pas marteler un serveur SMTP en difficulté.
        scheduledAt: new Date(Date.now() + 5 * 60_000),
      }).where(eq(emailQueue.id, row.id));
      await db.insert(emailLog).values({ queueId: row.id, toAddress: row.to_address, subject: row.subject, status: "failed", error: message.slice(0, 500) });
    }
  }

  return { processed: claimed.length, sent, failed };
}

/** Traitement des e-mails en échec définitif, pour supervision. */
export async function listFailedEmails(limit = 50) {
  const db = getDb();
  return db.select().from(emailQueue).where(eq(emailQueue.status, "failed")).orderBy(asc(emailQueue.createdAt)).limit(limit);
}
