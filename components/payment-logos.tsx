import Image from "next/image";
import { logosFor } from "@/lib/payments/logos";

/** Rangée de logos des moyens de paiement donnés (codes : wave, orange_money, mtn_momo, moov_money, card). */
export function PaymentLogos({ methods, height = 26, className = "" }: { methods: readonly string[]; height?: number; className?: string }) {
  const logos = logosFor(methods);
  if (!logos.length) return null;
  return <ul className={`payment-logos ${className}`} aria-label="Moyens de paiement acceptés">
    {logos.map((logo) => <li key={logo.src}><Image src={logo.src} alt={logo.label} width={Math.round(height * 1.58)} height={height} unoptimized style={{ width: Math.round(height * 1.58), height }}/></li>)}
  </ul>;
}
