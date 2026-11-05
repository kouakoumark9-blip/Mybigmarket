/**
 * Téléversement des photos d'un produit depuis l'administration : fichiers JPEG, PNG ou WebP
 * (type déclaré et signature binaire vérifiés), envoyés vers le stockage public (Vercel Blob),
 * puis enregistrés comme images du produit par le même service que l'ajout par URL (ordre,
 * couverture, audit, événement). Une photo envoyée mais non enregistrée est retirée du stockage.
 */
import { deletePublicBlobs, uploadPublicImages, validateFiles } from "@/lib/uploads";
import type { Db } from "@/server/core/db";
import { errors } from "@/server/core/errors";
import type { Context } from "@/server/modules/catalog/shared";
import { addImage, listImages } from "@/server/modules/catalog/products/relations";
import { findProduct } from "@/server/modules/catalog/products/service";

export const MAX_PHOTOS_PER_UPLOAD = 10;
/** Par photo ; le back-office réduit les photos avant l'envoi (2 000 px), bien en dessous. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
/** Par requête : sous la limite de 4,5 Mo des fonctions Vercel. */
export const MAX_UPLOAD_REQUEST_BYTES = 4_400_000;

export type PhotoUpload = { files: File[]; alt: string | null; isCover: boolean };

export function photoStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_PUBLIC_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN);
}

/** Lit l'envoi multipart : champs `files` (un ou plusieurs), `alt` et `isCover` facultatifs. */
export async function readPhotoUpload(request: Request): Promise<PhotoUpload> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw errors.badRequest("Envoi de fichiers illisible.");
  }
  const files = form.getAll("files").filter((entry): entry is File => typeof entry === "object" && entry !== null && "arrayBuffer" in entry && (entry as File).size > 0);
  const alt = String(form.get("alt") ?? "").trim().slice(0, 190) || null;
  const isCover = ["1", "true", "on"].includes(String(form.get("isCover") ?? "").toLowerCase());
  return { files, alt, isCover };
}

export async function uploadProductPhotos(database: Db, productId: string, input: PhotoUpload, context: Context) {
  if (!input.files.length) throw errors.validation([{ path: "files", message: "Choisissez au moins une photo." }]);
  if (!(await findProduct(database, productId))) throw errors.notFound("Produit", productId);
  try {
    await validateFiles(input.files, "image", MAX_PHOTOS_PER_UPLOAD, MAX_PHOTO_BYTES);
  } catch (error) {
    throw errors.validation([{ path: "files", message: `${error instanceof Error ? error.message : "Fichier refusé."} Formats acceptés : JPEG, PNG, WebP ; 4 Mo au plus par photo.` }]);
  }
  if (!photoStorageConfigured()) throw errors.unavailable("Le stockage des photos n'est pas configuré (Vercel Blob) : ajoutez la photo par son URL en attendant.");
  const blobs = await uploadPublicImages(input.files, productId);
  const added: Awaited<ReturnType<typeof addImage>>[] = [];
  try {
    for (const [index, blob] of blobs.entries()) added.push(await addImage(database, productId, { url: blob.url, alt: input.alt, isCover: input.isCover && index === 0 }, context));
  } catch (error) {
    await deletePublicBlobs(blobs.slice(added.length).map((blob) => blob.url)).catch(() => undefined);
    throw error;
  }
  return { added, images: await listImages(database, productId) };
}
