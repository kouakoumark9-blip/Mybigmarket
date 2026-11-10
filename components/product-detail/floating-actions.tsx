"use client";

import { ArrowUp } from "lucide-react";
import { pdpConfig } from "@/lib/pdp/config";

export function FloatingActions() {
  const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return <div className="pd-floating" role="complementary" aria-label="Actions rapides">
    <button type="button" onClick={toTop} title={pdpConfig.backToTop}><ArrowUp size={20} strokeWidth={1.5} aria-hidden="true"/><span>{pdpConfig.backToTop}</span></button>
  </div>;
}
