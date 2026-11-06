"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { Supplier } from "@/lib/pdp/types";
import { useCountryPreferences } from "@/components/country-preferences";

function Flag({ code }: { code: string }) {
  return <span className="pd-flag" aria-hidden="true">{code}</span>;
}

export function SupplierCard({ supplier, id, idPrefix = "pd-supplier" }: { supplier: Supplier; id?: string; idPrefix?: string }) {
  const { tr, locale } = useCountryPreferences();
  const rating = supplier.rating.toLocaleString(locale, { maximumFractionDigits: 1 });
  const metrics = [
    { label: tr("Chiffre d'affaires"), value: supplier.onlineRevenue },
    { label: tr("Temps de réponse"), value: supplier.responseTime === "Non communiqué" ? supplier.responseTime : tr(supplier.responseTime) },
    { label: tr("Expédié à temps"), value: supplier.onTimeShipping ? `${supplier.onTimeShipping} %` : "Non communiqué" },
    { label: tr("Note boutique"), value: supplier.ratingCount > 0 ? <>{rating}/5 <small>({supplier.ratingCount.toLocaleString(locale)})</small></> : tr("Nouveau vendeur") },
  ].filter((metric) => metric.value !== "Non communiqué");

  return <section className="pd-supplier" id={id} aria-labelledby={`${idPrefix}-name`}>
    <div className="pd-supplier-head">
      <span className="pd-supplier-logo" aria-hidden="true">{supplier.initials}</span>
      <div className="pd-supplier-id">
        <h2 id={`${idPrefix}-name`}><Link href={supplier.profileHref || "/vendeurs"}>{supplier.name}</Link></h2>
        <p><Flag code={supplier.countryCode}/> {tr(supplier.country)} · {supplier.yearsActive} {supplier.yearsActive > 1 ? tr("ans") : tr("an")} · {tr(supplier.type)}
          {supplier.verified ? <span className="pd-verified"><BadgeCheck size={14} strokeWidth={1.75} aria-hidden="true"/> {tr("Vérifié")}</span> : null}
        </p>
      </div>
    </div>
    <dl className="pd-supplier-metrics">
      {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
    </dl>
  </section>;
}
