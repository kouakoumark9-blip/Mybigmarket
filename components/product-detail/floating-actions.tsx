"use client";

import Link from "next/link";
import { ArrowUp, MessageCircle, ScanSearch } from "lucide-react";
import { pdpConfig } from "@/lib/pdp/config";

export function FloatingActions({ onImageSearch }: { onImageSearch: () => void }) {
  const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return <div className="pd-floating" role="complementary" aria-label="Actions rapides">
    <Link href="/messages" title={pdpConfig.messaging}><MessageCircle size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.messaging}</span></Link>
    <button type="button" onClick={onImageSearch} title={pdpConfig.imageSearch}><ScanSearch size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.imageSearch}</span></button>
    <button type="button" onClick={toTop} title={pdpConfig.backToTop}><ArrowUp size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.backToTop}</span></button>
  </div>;
}
