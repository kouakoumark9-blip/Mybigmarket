import { describe, expect, it } from "vitest";
import { DOCUMENT_PREFIXES, fiscalYearOf, isValidDocumentNumber, orderReference } from "../lib/document-numbers";

describe("préfixes de documents", () => {
  it("n'utilise jamais deux fois le même préfixe", () => {
    const prefixes = Object.values(DOCUMENT_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("couvre les cinq types de documents", () => {
    expect(Object.keys(DOCUMENT_PREFIXES).sort()).toEqual(["credit_note", "invoice", "order", "refund", "return"]);
  });
});

describe("isValidDocumentNumber", () => {
  it("accepte le format attendu", () => {
    expect(isValidDocumentNumber("invoice", "FAC-2026-000001")).toBe(true);
    expect(isValidDocumentNumber("credit_note", "AVR-2026-000042")).toBe(true);
  });

  it("refuse un préfixe d'un autre type", () => {
    expect(isValidDocumentNumber("invoice", "AVR-2026-000001")).toBe(false);
  });

  it("refuse une séquence trop courte ou non numérique", () => {
    expect(isValidDocumentNumber("invoice", "FAC-2026-1")).toBe(false);
    expect(isValidDocumentNumber("invoice", "FAC-2026-00A001")).toBe(false);
  });

  it("tolère les espaces autour", () => {
    expect(isValidDocumentNumber("invoice", "  FAC-2026-000010 ")).toBe(true);
  });
});

describe("fiscalYearOf", () => {
  it("prend l'année de la date fournie", () => {
    expect(fiscalYearOf(new Date("2026-12-31T23:00:00Z"))).toBe(2026);
  });
});

describe("orderReference", () => {
  it("produit un format lisible", () => {
    expect(orderReference(new Date("2026-06-15"), "abc123")).toBe("CMD-2026-ABC123");
  });

  it("complète à six caractères", () => {
    expect(orderReference(new Date("2026-06-15"), "12")).toBe("CMD-2026-000012");
  });

  it("reste stable pour une même entrée", () => {
    expect(orderReference(new Date("2026-01-01"), "x")).toBe(orderReference(new Date("2026-01-01"), "x"));
  });
});
