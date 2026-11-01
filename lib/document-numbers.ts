import { and, eq, sql } from "drizzle-orm";
import { documentSequences } from "./db/schema";
import { invoiceNumber } from "./order-rules";

/**
 * Numérotation des documents légaux — module 6.
 *
 * Une facture doit porter un numéro issu d'une séquence continue, sans trou ni
 * doublon. On ne peut pas se contenter d'un `count(*) + 1` : deux factures
 * émises simultanément obtiendraient le même numéro, et une suppression
 * créerait un trou définitif.
 *
 * La séquence est donc incrémentée dans la transaction de l'appelant, avec un
 * verrou de ligne (`FOR UPDATE`) : deux transactions concurrentes sont
 * sérialisées, la seconde attend puis obtient le numéro suivant.
 */

export type DocumentType = "invoice" | "credit_note" | "order" | "return" | "refund";

export const DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  invoice: "FAC",
  credit_note: "AVR",
  order: "CMD",
  return: "RET",
  refund: "RMB",
};

/**
 * Réserve le prochain numéro d'une séquence. Doit être appelé DANS une
 * transaction : hors transaction, le verrou est relâché immédiatement.
 */
export async function nextDocumentNumber(
  tx: unknown,
  documentType: DocumentType,
  fiscalYear: number,
): Promise<string> {
  const database = tx as {
    execute: (query: unknown) => Promise<{ rows?: unknown[] } | unknown[]>;
  };
  const year = Math.trunc(fiscalYear);

  // Upsert atomique : crée la ligne de l'année si elle n'existe pas, puis
  // renvoie la valeur incrémentée. `RETURNING` est la seule façon sûre de
  // connaître le numéro réellement attribué.
  const raw = await database.execute(sql`
    insert into ${documentSequences} (document_type, fiscal_year, last_value, updated_at)
    values (${documentType}, ${year}, 1, now())
    on conflict (document_type, fiscal_year)
    do update set last_value = ${documentSequences.lastValue} + 1, updated_at = now()
    returning last_value
  `);

  const rows = Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? [];
  const first = rows[0] as { last_value?: number | string } | undefined;
  const value = Number(first?.last_value ?? 0);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`Séquence ${documentType}/${year} illisible : aucun numéro attribué.`);
  }
  return invoiceNumber(year, value, DOCUMENT_PREFIXES[documentType]);
}

/** Année fiscale de référence : l'exercice en cours, jamais celui du client. */
export function fiscalYearOf(date: Date = new Date()): number {
  return date.getUTCFullYear();
}

/** Vérifie qu'un numéro respecte le format attendu pour son type. */
export function isValidDocumentNumber(documentType: DocumentType, value: string): boolean {
  const prefix = DOCUMENT_PREFIXES[documentType];
  return new RegExp(`^${prefix}-\\d{4}-\\d{6}$`).test(value.trim());
}

/**
 * Référence lisible d'une commande. Non légale, donc elle peut être générée
 * sans verrou : un doublon éventuel est rattrapé par l'index unique.
 */
export function orderReference(date: Date, suffix: string): string {
  const year = date.getUTCFullYear();
  const token = suffix.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase().padStart(6, "0");
  return `CMD-${year}-${token}`;
}

/** Lecture du dernier numéro émis, pour l'écran de suivi des séquences. */
export async function readSequences(
  db: { select: (...args: never[]) => unknown },
  fiscalYear: number,
): Promise<Array<{ documentType: string; lastValue: number }>> {
  const query = (db as unknown as {
    select: (fields: Record<string, unknown>) => {
      from: (table: unknown) => { where: (condition: unknown) => Promise<Array<{ documentType: string; lastValue: number }>> };
    };
  }).select({ documentType: documentSequences.documentType, lastValue: documentSequences.lastValue })
    .from(documentSequences)
    .where(and(eq(documentSequences.fiscalYear, fiscalYear)));
  const rows = await query;
  return rows.map((row) => ({ documentType: row.documentType, lastValue: Number(row.lastValue) }));
}
