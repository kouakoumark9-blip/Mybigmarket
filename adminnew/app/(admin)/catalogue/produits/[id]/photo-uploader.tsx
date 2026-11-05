"use client";

/**
 * Ajout de photos depuis l'ordinateur ou le téléphone : glisser-déposer ou sélection, aperçu,
 * réduction dans le navigateur (2 000 px de côté au plus, orientation de l'appareil respectée)
 * puis envoi photo par photo, avec l'état de chacune. Le format est revérifié par l'API.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, TriangleAlert, Upload } from "lucide-react";
import { uploadPhotosAction } from "./actions";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILES = 10;
const MAX_SIDE = 2000;
/** Fichier d'origine au-delà duquel la photo est refusée avant même d'être réduite. */
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
/** En dessous, une photo déjà assez petite est envoyée telle quelle. */
const KEEP_ORIGINAL_BYTES = 1_500_000;

type Item = { key: string; name: string; preview: string; status: "waiting" | "sending" | "done" | "error"; message?: string; file: File };

/** Réduit la photo si elle est grande ; garde l'original s'il est déjà léger. */
async function prepare(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_ORIGINAL_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  // PNG et WebP peuvent être transparents : WebP les conserve ; une photo devient un JPEG.
  const keepsAlpha = file.type !== "image/jpeg";
  if (!keepsAlpha) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  let blob = await toBlob(keepsAlpha ? "image/webp" : "image/jpeg");
  if (!blob || !ACCEPTED.includes(blob.type)) blob = await toBlob("image/jpeg");
  if (!blob || blob.size >= file.size) return file;
  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.${extension}`, { type: blob.type });
}

export function PhotoUploader({ productId, hasImages }: { productId: string; hasImages: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [alt, setAlt] = useState("");
  const [cover, setCover] = useState(!hasImages);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Libère les aperçus quand le composant disparaît.
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const update = (key: string, patch: Partial<Item>) => setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  function addFiles(list: FileList | File[]) {
    setNotice(null);
    const files = Array.from(list);
    const refused = files.filter((file) => !ACCEPTED.includes(file.type) || file.size > MAX_SOURCE_BYTES);
    const accepted = files.filter((file) => !refused.includes(file)).slice(0, MAX_FILES);
    const messages: string[] = [];
    if (refused.length) messages.push(`${refused.length} fichier(s) ignoré(s) : formats acceptés JPEG, PNG ou WebP.`);
    if (files.length - refused.length > MAX_FILES) messages.push(`${MAX_FILES} photos au plus par envoi.`);
    if (messages.length) setNotice(messages.join(" "));
    const next = accepted.map((file, index) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { key: `${Date.now()}-${index}-${file.name}`, name: file.name, preview, status: "waiting" as const, file };
    });
    setItems((current) => [...current.filter((item) => item.status !== "done"), ...next].slice(-MAX_FILES));
  }

  async function send() {
    const queue = items.filter((item) => item.status === "waiting" || item.status === "error");
    if (!queue.length || busy) return;
    setBusy(true);
    setNotice(null);
    let added = 0;
    let first = true;
    for (const item of queue) {
      update(item.key, { status: "sending", message: undefined });
      try {
        const file = await prepare(item.file);
        const form = new FormData();
        form.set("productId", productId);
        form.append("files", file, file.name);
        if (alt.trim()) form.set("alt", alt.trim());
        if (cover && first) form.set("isCover", "true");
        const result = await uploadPhotosAction(form);
        if (result.ok) {
          added += result.added;
          first = false;
          update(item.key, { status: "done" });
        } else update(item.key, { status: "error", message: result.error });
      } catch {
        update(item.key, { status: "error", message: "Envoi interrompu : vérifiez la connexion puis réessayez." });
      }
    }
    setBusy(false);
    if (added) {
      setNotice(`${added} photo${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}.`);
      setCover(false);
      router.refresh();
    }
  }

  const pending = items.filter((item) => item.status === "waiting" || item.status === "error").length;

  return <div className="mb-5 grid gap-3">
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files); }}
      className={`grid place-items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${dragging ? "border-slate-500 bg-slate-50" : "border-slate-200 bg-white"}`}
    >
      <ImagePlus size={26} className="text-slate-400" aria-hidden/>
      <p className="text-sm font-semibold text-slate-700">Glissez vos photos ici</p>
      <button type="button" onClick={() => input.current?.click()} className="ui-button ui-button-outline"><Upload size={15}/> Choisir des photos</button>
      <p className="text-xs text-slate-500">JPEG, PNG ou WebP · {MAX_FILES} photos au plus par envoi · réduites automatiquement à {MAX_SIDE} px</p>
      <input ref={input} type="file" accept={ACCEPTED.join(",")} multiple className="sr-only" aria-label="Choisir des photos" onChange={(event) => { if (event.target.files?.length) addFiles(event.target.files); event.target.value = ""; }}/>
    </div>

    {items.length > 0 && <>
      <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => <li key={item.key} className="overflow-hidden rounded-lg border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.preview} alt="" className="aspect-square w-full bg-slate-50 object-contain"/>
          <div className="grid gap-1 border-t border-slate-100 p-2 text-xs">
            <span className="truncate font-semibold text-slate-700" title={item.name}>{item.name}</span>
            {item.status === "waiting" && <span className="text-slate-500">Prête à envoyer</span>}
            {item.status === "sending" && <span className="flex items-center gap-1 text-slate-700"><Loader2 size={13} className="animate-spin"/> Envoi…</span>}
            {item.status === "done" && <span className="flex items-center gap-1 font-semibold text-slate-800"><CheckCircle2 size={13}/> Ajoutée</span>}
            {item.status === "error" && <span className="flex items-start gap-1 text-red-700"><TriangleAlert size={13} className="mt-0.5 shrink-0"/> {item.message}</span>}
          </div>
        </li>)}
      </ul>
      <div className="grid gap-3 md:grid-cols-[2fr_auto_auto] md:items-end">
        <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Texte alternatif (facultatif)</span><input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={190} placeholder="Ex. : mixeur plongeant, vue de face" className="ui-input"/></label>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={cover} onChange={(event) => setCover(event.target.checked)}/> La première devient la couverture</label>
        <button type="button" onClick={send} disabled={busy || pending === 0} className="ui-button ui-button-primary">{busy ? <><Loader2 size={15} className="animate-spin"/> Envoi en cours…</> : <><Upload size={15}/> Envoyer {pending > 0 ? `${pending} photo${pending > 1 ? "s" : ""}` : ""}</>}</button>
      </div>
    </>}
    {notice && <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700" role="status">{notice}</p>}
  </div>;
}
