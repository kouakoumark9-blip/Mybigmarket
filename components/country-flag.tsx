import Image from "next/image";

const FLAG_CODES = new Set(["BJ", "BF", "CV", "CI", "GM", "GH", "GN", "GW", "LR", "ML", "MR", "NE", "NG", "SN", "SL", "TG", "CN"]);

/** Drapeau d'un pays (fichiers SVG de public/flags, paquet libre « flag-icons »). Sans fichier : le code du pays. */
export function CountryFlag({ code, size = 20, className = "" }: { code: string; size?: number; className?: string }) {
  const upper = code.toUpperCase();
  if (!FLAG_CODES.has(upper)) return <span className={`country-flag country-flag-code ${className}`} aria-hidden="true">{upper}</span>;
  return <Image src={`/flags/${upper.toLowerCase()}.svg`} alt="" width={size} height={Math.round(size * 0.75)} unoptimized className={`country-flag ${className}`} aria-hidden="true"/>;
}
