"use client";

import { MessageCircle } from "lucide-react";

/** Bouton flottant « Écrire sur WhatsApp » ; le message reprend la page consultée (titre du produit). */
export function WhatsappButton({ number }: { number: string }) {
  if (!number) return null;
  const open = () => {
    const page = document.title.split("|")[0].trim();
    const text = `Bonjour mybigmarket, j’ai une question${page ? ` sur : ${page}` : ""} (${window.location.href})`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  return <button type="button" className="whatsapp-float" onClick={open} aria-label="Nous écrire sur WhatsApp"><MessageCircle size={24} strokeWidth={1.8}/><span>WhatsApp</span></button>;
}
