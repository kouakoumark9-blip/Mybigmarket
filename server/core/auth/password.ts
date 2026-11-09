/**
 * Hachage des mots de passe : argon2id (paramètres OWASP 2024 : m = 19 Mio, t = 2, p = 1).
 *
 * Les comptes existants sont en bcrypt : ils restent valides. À la connexion réussie,
 * `needsRehash` signale qu'il faut remplacer le hash par un argon2id (migration
 * transparente, sans réinitialisation de mot de passe).
 *
 */
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export type PasswordAlgorithm = "argon2id" | "bcrypt" | "unknown";

export function passwordAlgorithm(storedHash: string): PasswordAlgorithm {
  if (storedHash.startsWith("$argon2id$")) return "argon2id";
  if (/^\$2[aby]\$\d{2}\$/.test(storedHash)) return "bcrypt";
  return "unknown";
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length > PASSWORD_MAX_LENGTH) throw new Error("Mot de passe trop long.");
  // Algorithme par défaut de @node-rs/argon2 : argon2id.
  return argon2Hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || password.length > PASSWORD_MAX_LENGTH) return false;
  switch (passwordAlgorithm(storedHash)) {
    case "argon2id":
      try {
        return await argon2Verify(storedHash, password);
      } catch {
        return false;
      }
    case "bcrypt":
      return bcrypt.compare(password, storedHash);
    default:
      return false;
  }
}

/** Vrai si le hash n'est pas un argon2id aux paramètres courants. */
export function needsRehash(storedHash: string): boolean {
  if (passwordAlgorithm(storedHash) !== "argon2id") return true;
  return !storedHash.includes(`m=${ARGON2_OPTIONS.memoryCost},t=${ARGON2_OPTIONS.timeCost},p=${ARGON2_OPTIONS.parallelism}`);
}

let timingPad: Promise<string> | null = null;

/**
 * Vérification factice quand le compte n'existe pas : le temps de réponse ne révèle
 * pas l'existence d'une adresse e-mail.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  timingPad ??= hashPassword("timing-pad-for-unknown-account");
  await verifyPassword(password, await timingPad);
  return false;
}

/** Règles minimales : longueur et non-réutilisation de l'adresse e-mail. */
export function passwordProblems(password: string, email?: string): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) problems.push(`Au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  if (password.length > PASSWORD_MAX_LENGTH) problems.push(`Au plus ${PASSWORD_MAX_LENGTH} caractères.`);
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) problems.push("Ne doit pas contenir l'identifiant de l'adresse e-mail.");
  if (/^(.)\1+$/.test(password)) problems.push("Ne doit pas être un seul caractère répété.");
  return problems;
}
