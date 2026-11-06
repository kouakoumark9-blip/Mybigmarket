"use client";

import Link from "next/link";
import { ArrowUp, MessageCircle, ScanSearch } from "lucide-react";
import { pdpConfig } from "@/lib/pdp/config";
import { useCountryPreferences } from "@/components/country-preferences";

export function FloatingActions({ onImageSearch }: { onImageSearch: () => void }) {
  const { tr } = useCountryPreferences();
  const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return <div className="pd-floating" role="complementary" aria-label={tr("Actions rapides")}>
    <Link href="/messages" title={tr(pdpConfig.messaging)}><MessageCircle size={20} strokeWidth={1.5} aria-hidden="true"/><span>{tr(pdpConfig.messaging)}</span></Link>
    <button type="button" onClick={onImageSearch} title={tr(pdpConfig.imageSearch)}><ScanSearch size={20} strokeWidth={1.5} aria-hidden="true"/><span>{tr(pdpConfig.imageSearch)}</span></button>
    <button type="button" onClick={toTop} title={tr(pdpConfig.backToTop)}><ArrowUp size={20} strokeWidth={1.5} aria-hidden="true"/><span>{tr(pdpConfig.backToTop)}</span></button>
  </div>;
}
