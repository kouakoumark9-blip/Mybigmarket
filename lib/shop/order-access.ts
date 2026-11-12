import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Clé d'accès à la page de confirmation d'une commande.
 * Le numéro de commande seul ne suffit pas à ouvrir la confirmation (nom, téléphone et adresse du client) :
 * le client reçoit un lien contenant cette clé, calculée avec un secret du serveur et impossible à deviner.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET || process.env.ADMIN_API_JWT_SECRET || process.env.DATABASE_URL;
  if (!value) throw new Error("Aucun secret serveur disponible pour signer les liens de commande.");
  return value;
}

export function orderAccessKey(reference: string): string {
  return createHmac("sha256", secret()).update(`order-confirmation:${reference}`).digest("base64url").slice(0, 32);
}

export function isValidOrderAccessKey(reference: string, key: string | undefined): boolean {
  if (!key || key.length !== 32) return false;
  const expected = Buffer.from(orderAccessKey(reference));
  const given = Buffer.from(key);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
