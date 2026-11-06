"use client";

import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { locate, type Located } from "@/lib/geo/nearest";
import { useCountryPreferences } from "@/components/country-preferences";
import { countryName } from "@/lib/west-africa";

type Props = {
  /** Reçoit le pays (et la ville) déduits de la position. Le parent applique le choix. */
  onLocated: (place: Located) => void;
  className?: string;
};

/**
 * Bouton « Utiliser ma position » : demande l'autorisation du navigateur au clic (jamais au chargement),
 * déduit le pays et la ville dans le navigateur, puis laisse le client corriger. Rien n'est envoyé au serveur.
 */
export function LocateButton({ onLocated, className = "" }: Props) {
  const { text, language } = useCountryPreferences();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const fail = (key: "locationOutside" | "locationDenied" | "locationUnavailable" | "locationUnsupported") => { setState("error"); setMessage(text(key)); };

  const run = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return fail("locationUnsupported");
    setState("loading"); setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place = locate(position.coords.latitude, position.coords.longitude);
        if (!place) return fail("locationOutside");
        setState("done");
        setMessage(`${text("locationDetected")} ${place.city ? `${place.city}, ` : ""}${countryName(place.countryCode, language)}`);
        onLocated(place);
      },
      (error) => fail(error.code === error.PERMISSION_DENIED ? "locationDenied" : "locationUnavailable"),
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 10 * 60_000 },
    );
  };

  return <div className={`locate-box ${className}`}>
    <button type="button" className="locate-button" onClick={run} disabled={state === "loading"}>
      {state === "loading" ? <Loader2 size={16} className="locate-spin" aria-hidden="true"/> : <Crosshair size={16} aria-hidden="true"/>}
      {state === "loading" ? text("locating") : text("useMyLocation")}
    </button>
    {message && <p className={`locate-message${state === "error" ? " is-error" : ""}`} role={state === "error" ? "alert" : "status"}>{message}</p>}
    {state !== "done" && <p className="locate-privacy">{text("locationPrivacy")}</p>}
  </div>;
}
