/**
 * Hygiène du dépôt (audit de sécurité) :
 * - aucun secret versionné (clés d'API, jetons, clés privées, URL de base avec mot de passe) ;
 * - .env.example documente chaque variable d'environnement lue par le code, hors variables
 *   fournies par la plateforme (NODE_ENV, VERCEL_*, CI).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const textFiles = tracked.filter((file) => /\.(ts|tsx|js|mjs|cjs|json|md|sql|ya?ml|env|example|txt|css|html)$/.test(file) && !file.includes("package-lock.json") && !file.startsWith("drizzle/meta/"));
const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["clé Anthropic", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["clé privée", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["clé AWS", /AKIA[0-9A-Z]{16}/],
  ["jeton GitHub", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["jeton Vercel Blob", /vercel_blob_rw_[A-Za-z0-9]{16,}/],
  ["clé Stripe", /sk_live_[A-Za-z0-9]{16,}/],
  // Un gabarit comme USER:PASSWORD@HOST (majuscules) n'est pas un secret.
  ["URL Neon avec mot de passe", /postgres(ql)?:\/\/[^:\s/]+:(?![A-Z_]+@)[^@\s]{8,}@[^\s/]*neon\.tech/],
  ["jeton Slack", /xox[baprs]-[A-Za-z0-9-]{10,}/],
];

describe("hygiène du dépôt", () => {
  it("ne contient aucun secret", () => {
    const findings: string[] = [];
    for (const file of textFiles) {
      const content = read(file);
      for (const [label, pattern] of SECRET_PATTERNS) if (pattern.test(content)) findings.push(`${file} : ${label}`);
    }
    expect(findings).toEqual([]);
  });

  it("ne versionne aucun fichier d'environnement réel", () => {
    expect(tracked.filter((file) => /(^|\/)\.env(\.[a-z]+)?$/.test(file) && !file.endsWith(".env.example"))).toEqual([]);
  });

  it("documente dans .env.example chaque variable lue par le code", () => {
    const documented = new Set([...read(".env.example").matchAll(/^#?\s?([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]));
    const platform = /^(NODE_ENV|CI|VERCEL(_[A-Z_]+)?|NEXT_RUNTIME)$/;
    const sources = tracked.filter((file) => /\.(ts|tsx|mjs)$/.test(file) && !file.startsWith("tests/") && !file.endsWith(".test.ts"));
    const used = new Set(sources.flatMap((file) => [...read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1])));
    const missing = [...used].filter((name) => !platform.test(name) && !documented.has(name)).sort();
    expect(missing).toEqual([]);
  });
});
