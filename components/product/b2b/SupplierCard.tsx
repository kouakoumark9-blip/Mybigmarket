import { Globe, Sparkles } from "lucide-react";
import Link from "next/link";
import type { SupplierView } from "@/lib/product-detail-data";

/**
 * Carte fournisseur sous la galerie.
 *
 * Ne montre que des chiffres réellement en base (note, nombre d'avis, délai de
 * réponse, taux de livraison). Un indicateur absent est simplement omis : une
 * place de marché ne doit pas inventer une performance fournisseur.
 */

const FLAGS: Record<string, string> = {
  CN: "🇨🇳",
  CI: "🇨🇮",
  SN: "🇸🇳",
  ML: "🇲🇱",
  BF: "🇧🇫",
  GH: "🇬🇭",
  NG: "🇳🇬",
  FR: "🇫🇷",
  US: "🇺🇸",
  GB: "🇬🇧",
};

const formatHours = (hours: number | null) => {
  if (hours === null) return null;
  if (hours <= 1) return "≤1h";
  return `≤${Math.round(hours)}h`;
};

export function SupplierCard({ supplier }: { supplier: SupplierView }) {
  const stats = [
    supplier.ratingAverage !== null
      ? { value: `${supplier.ratingAverage.toFixed(1)}/5`, sub: `(${supplier.ratingCount})`, label: "Note de la boutique" }
      : null,
    formatHours(supplier.responseTimeHours)
      ? { value: formatHours(supplier.responseTimeHours) as string, sub: "", label: "Temps de réponse" }
      : null,
    supplier.onTimeDeliveryRate !== null
      ? { value: `≥${Math.round(supplier.onTimeDeliveryRate)}%`, sub: "", label: "Livraison dans les délais" }
      : null,
  ].filter((item): item is { value: string; sub: string; label: string } => item !== null);

  return <section className="b2b-supplier" aria-label="Fournisseur">
    <div className="b2b-supplier-head">
      <span className="b2b-supplier-logo" aria-hidden="true">{supplier.logoInitials}</span>
      <div>
        <b className="b2b-supplier-name">{supplier.name}</b>
        <p className="b2b-supplier-meta">
          <span aria-hidden="true">{FLAGS[supplier.countryCode] ?? "🌍"}</span>
          {supplier.countryLabel}
          {supplier.yearsActive !== null && <> · {supplier.yearsActive} {supplier.yearsActive > 1 ? "ans" : "an"}</>}
          {supplier.city && <> · {supplier.city}</>}
        </p>
      </div>
    </div>

    {stats.length > 0 && <div className="b2b-supplier-stats">
      {stats.map((stat) => <div key={stat.label}>
        <b>{stat.value}</b>{stat.sub && <small> {stat.sub}</small>}
        <span>{stat.label}</span>
      </div>)}
    </div>}

    {supplier.mainMarkets.length > 0 && <p className="b2b-supplier-markets">
      <Globe size={15} aria-hidden="true" />
      <span>Marchés principaux : <b>{supplier.mainMarkets.slice(0, 4).join(", ")}</b></span>
    </p>}

    <p className="b2b-supplier-verified">
      <Sparkles size={15} aria-hidden="true" />
      <span>Vérification des fournisseurs</span>
      <Link href={`/produits?q=${encodeURIComponent(supplier.name)}`}>Voir ses produits <span aria-hidden="true">›</span></Link>
    </p>
  </section>;
}
