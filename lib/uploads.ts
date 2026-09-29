import "server-only";
import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const documentTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
function safeName(name: string) { return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90) || "upload"; }

async function hasValidMagic(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") return bytes.slice(0,4).join(",") === "137,80,78,71";
  if (file.type === "image/webp") return String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  if (file.type === "application/pdf") return String.fromCharCode(...bytes.slice(0,4)) === "%PDF";
  return false;
}

export async function validateFiles(files: File[], kind: "image" | "document", maxFiles: number, maxBytes = 5 * 1024 * 1024) {
  if (files.length > maxFiles) throw new Error(`Maximum : ${maxFiles} fichier(s).`);
  for (const file of files) {
    if (file.size < 1 || file.size > maxBytes) throw new Error(`Taille de fichier invalide : ${file.name}.`);
    const allowed = kind === "image" ? imageTypes : documentTypes;
    if (!allowed.has(file.type) || !(await hasValidMagic(file))) throw new Error(`Format de fichier refusé : ${file.name}.`);
  }
}

export async function uploadPublicImages(files: File[], ownerId: string) {
  const token = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Le stockage d’images n’est pas configuré.");
  const blobs = [];
  for (const file of files) blobs.push(await put(`product-images/${ownerId}/${randomUUID()}-${safeName(file.name)}`, file, { access: "public", token, addRandomSuffix: false, contentType: file.type }));
  return blobs;
}

export async function uploadPrivateDocuments(files: File[], ownerId: string) {
  const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  if (!token) throw new Error("Le stockage privé des justificatifs n’est pas configuré.");
  const documents: Array<{name:string;pathname:string;contentType:string}> = [];
  for (const file of files) {
    const blob = await put(`seller-kyc/${ownerId}/${randomUUID()}-${safeName(file.name)}`, file, { access: "private", token, addRandomSuffix: false, contentType: file.type });
    documents.push({ name: file.name.replace(/[\r\n]/g, "").slice(0, 120), pathname: blob.pathname, contentType: file.type });
  }
  return documents;
}

export async function deletePublicBlobs(urls: string[]) {
  const token = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (token && urls.length) await del(urls, { token });
}
