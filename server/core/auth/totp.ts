/**
 * Copie de adminnew/lib/totp.ts (TOTP RFC 6238, secret chiffré AES-256-GCM).
 * tests/totp-sync.test.ts vérifie que les deux copies restent identiques.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey(): Buffer {
  const raw = process.env.ADMIN_TOTP_ENCRYPTION_KEY;
  if (!raw) throw new Error("ADMIN_TOTP_ENCRYPTION_KEY is required when TOTP is enabled.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ADMIN_TOTP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return key;
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret.replace(/\s+/g, "").toUpperCase(), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTotpSecret(payload: string): string {
  const [version, ivText, tagText, cipherText] = payload.split(".");
  if (version !== "v1" || !ivText || !tagText || !cipherText) throw new Error("Stored TOTP secret has an invalid format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64url")), decipher.final()]).toString("utf8");
}

function decodeBase32(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("TOTP secret is not valid base32.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function codeForCounter(secret: Buffer, counter: number): string {
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(input).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secretBase32: string, submittedCode: string, now = Date.now()): boolean {
  const code = submittedCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const secret = decodeBase32(secretBase32);
  const counter = Math.floor(now / 30_000);
  const submitted = Buffer.from(code);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(codeForCounter(secret, counter + drift));
    if (timingSafeEqual(submitted, expected)) return true;
  }
  return false;
}
