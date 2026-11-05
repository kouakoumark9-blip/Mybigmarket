/**
 * CSV partagé (imports, exports) : lecture tolérante (séparateur « ; » ou « , » détecté, guillemets,
 * retours à la ligne dans une cellule, BOM UTF-8) et écriture sûre (injection de formule neutralisée).
 */

/** Cellule CSV sûre : guillemets doublés, et neutralisation des formules (injection CSV). */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Fichier CSV complet : BOM (Excel), séparateur « ; », fins de ligne CRLF. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return `﻿${[header.map(csvCell).join(";"), ...rows.map((row) => row.map(csvCell).join(";"))].join("\r\n")}\r\n`;
}

/** Séparateur de la première ligne, hors guillemets. */
function detectSeparator(text: string): ";" | "," | "\t" {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  return counts["\t"] > counts[";"] && counts["\t"] > counts[","] ? "\t" : counts[";"] >= counts[","] ? ";" : ",";
}

export type CsvRecord = { line: number; cells: string[] };

/** Enregistrements avec leur numéro de ligne physique (une cellule peut s'étendre sur plusieurs lignes). */
export function parseCsvRecords(text: string): CsvRecord[] {
  const clean = text.replace(/^﻿/, "");
  const separator = detectSeparator(clean);
  const records: CsvRecord[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let startLine = 1;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"' && clean[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false;
      else { if (char === "\n") line += 1; cell += char; }
    } else if (char === '"') quoted = true;
    else if (char === separator) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell); records.push({ line: startLine, cells: row }); row = []; cell = "";
      line += 1; startLine = line;
    } else cell += char;
  }
  if (cell !== "" || row.length) { row.push(cell); records.push({ line: startLine, cells: row }); }
  return records.filter((record) => record.cells.some((value) => value.trim() !== ""));
}

/** Lecture CSV simple (séparateur ; ou , détecté, guillemets gérés). */
export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).map((record) => record.cells);
}

/** En-tête comparable : minuscules, sans accents, espaces et tirets en « _ ». */
export function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}
