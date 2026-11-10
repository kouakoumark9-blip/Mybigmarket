"use client";

import { ArrowUp, MessageCircle, ScanSearch } from "lucide-react";
import { pdpConfig } from "@/lib/pdp/config";

export function FloatingActions({ onImageSearch }: { onImageSearch: () => void }) {
  const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return <div className="pd-floating" role="complementary" aria-label="Actions rapides">
    {/* Redirection serveur vers WhatsApp : lien classique, pas de préchargement Next (la CSP bloque wa.me en connect-src). */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a href="/messages" title={pdpConfig.messaging}><MessageCircle size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.messaging}</span></a>
    <button type="button" onClick={onImageSearch} title={pdpConfig.imageSearch}><ScanSearch size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.imageSearch}</span></button>
    <button type="button" onClick={toTop} title={pdpConfig.backToTop}><ArrowUp size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.backToTop}</span></button>
  </div>;
}
