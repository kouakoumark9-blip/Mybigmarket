"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, X } from "lucide-react";
import { pdpConfig } from "@/lib/pdp/config";
import "@/components/product-detail/pdp.css";

/**
 * Recherche par image. Le moteur visuel n'est pas encore branché :
 * l'utilisateur dépose une photo puis décrit le produit, et la recherche texte prend le relais.
 */
export function ImageSearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!open) return null;
  return <div className="pd-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="pd-modal" role="dialog" aria-modal="true" aria-labelledby="image-search-title" onSubmit={(event) => { event.preventDefault(); onClose(); router.push(`/produits${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`); }}>
      <header className="pd-modal-head"><h2 id="image-search-title">{pdpConfig.imageSearch}</h2><button type="button" onClick={onClose} aria-label="Fermer" autoFocus><X size={20} strokeWidth={1.5}/></button></header>
      <label className="pd-dropzone">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="Image sélectionnée"/> : <><ImageUp size={28} strokeWidth={1.5} aria-hidden="true"/><span>Choisissez ou déposez une photo du produit</span></>}
        <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPreview(URL.createObjectURL(file)); }}/>
      </label>
      <div className="pd-calc-field">
        <label htmlFor="image-search-query">Décrivez le produit (mots-clés)</label>
        <input id="image-search-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. montre acier bracelet cuir"/>
      </div>
      <p className="pd-modal-note">La reconnaissance d&apos;image n&apos;est pas encore active : la recherche se fait sur les mots-clés saisis.</p>
      <button type="submit" className="pd-btn pd-btn-primary pd-btn-block">Rechercher</button>
    </form>
  </div>;
}
