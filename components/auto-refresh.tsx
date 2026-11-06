"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recharge la page toutes les quelques secondes pendant qu'un paiement mobile est confirmé (3 minutes au plus). */
export function AutoRefresh({ everyMs = 6000, maxMs = 180_000 }: { everyMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - started > maxMs) { window.clearInterval(timer); return; }
      router.refresh();
    }, everyMs);
    return () => window.clearInterval(timer);
  }, [router, everyMs, maxMs]);
  return null;
}
