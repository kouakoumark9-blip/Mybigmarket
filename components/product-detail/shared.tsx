"use client";

import Image, { type ImageProps } from "next/image";
import { Star } from "lucide-react";
import { useCountryPreferences } from "@/components/country-preferences";

/** next/image avec prise en charge des visuels SVG de remplacement. */
export function PdpImage(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  return <Image {...props} alt={props.alt} unoptimized={props.unoptimized ?? src.endsWith(".svg")}/>;
}

/** Fourchette de prix « 919 – 1 409 FCFA » dans la devise de la destination. */
export function usePriceRange() {
  const { formatPrice } = useCountryPreferences();
  return (min: number, max?: number) => {
    if (max === undefined || max === min) return formatPrice(min);
    const low = formatPrice(min);
    const high = formatPrice(max);
    const suffix = " FCFA";
    return low.endsWith(suffix) && high.endsWith(suffix) ? `${low.slice(0, -suffix.length)} – ${high}` : `${low} – ${high}`;
  };
}

export function Stars({ value, size = 14, label }: { value: number; size?: number; label?: string }) {
  const { tr, locale } = useCountryPreferences();
  return <span className="pd-stars" role="img" aria-label={label ?? tr("Note {n} sur 5", { n: value.toLocaleString(locale) })}>
    {Array.from({ length: 5 }, (_, index) => <Star key={index} size={size} strokeWidth={1.5} className={index < Math.round(value) ? "is-on" : ""} aria-hidden="true"/>)}
  </span>;
}

export function plural(count: number, word: string) {
  return `${count.toLocaleString("fr-FR")} ${word}${count > 1 ? "s" : ""}`;
}

/** Quantité avec unité traduite (pièce → piece, peça, قطعة). */
export function usePlural() {
  const { tr, locale } = useCountryPreferences();
  return (count: number, word: string) => {
    const unit = word === "pièce" ? (count > 1 ? tr("pièces") : tr("pièce")) : tr(count > 1 ? `${word}s` : word);
    return `${count.toLocaleString(locale)} ${unit}`;
  };
}
