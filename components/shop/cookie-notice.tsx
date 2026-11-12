"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";

const KEY = "mbm-info-stockage-v1";
const EVENT = "mbm-info-stockage";

function read(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}

/**
 * Information sur les cookies et le stockage local (RGPD / ePrivacy).
 * Le site n'utilise que du stockage strictement nécessaire (panier, favoris, commune, session de l'administration) :
 * aucun cookie publicitaire ni de mesure d'audience, donc une information suffit. Si un outil d'audience ou une publicité
 * était ajouté un jour, il faudrait ici un vrai choix « Accepter / Refuser » avant de le charger.
 */
export function CookieNotice() {
  // Côté serveur et à la première peinture : considéré comme « déjà vu », pour ne pas afficher de bandeau qui clignote.
  const seen = useSyncExternalStore(subscribe, read, () => true);
  if (seen) return null;
  const accept = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* stockage indisponible : le bandeau reviendra */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return <div className="mb-cookie" role="region" aria-label="Information sur les cookies">
    <ShieldCheck size={22} strokeWidth={1.6} aria-hidden="true"/>
    <p>Ce site utilise uniquement le stockage <b>indispensable</b> à son fonctionnement (votre panier, vos favoris). <b>Aucun cookie publicitaire, aucun suivi.</b> <Link href="/confidentialite">En savoir plus</Link></p>
    <button type="button" onClick={accept}>J&apos;ai compris</button>
  </div>;
}
