"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { Supplier } from "@/lib/pdp/types";

function Flag({ code }: { code: string }) {
  return <span className="pd-flag" aria-hidden="true">{code}</span>;
}

export function SupplierCard({ supplier, id, idPrefix = "pd-supplier" }: { supplier: Supplier; id?: string; idPrefix?: string }) {
  const rating = supplier.rating.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const metrics = [
    { label: "Chiffre d'affaires", value: supplier.onlineRevenue },
    { label: "Temps de réponse", value: supplier.responseTime },
    { label: "Expédié à temps", value: supplier.onTimeShipping ? `${supplier.onTimeShipping} %` : "Non communiqué" },
    { label: "Note boutique", value: supplier.ratingCount > 0 ? <>{rating}/5 <small>({supplier.ratingCount.toLocaleString("fr-FR")})</small></> : "Nouveau vendeur" },
  ].filter((metric) => metric.value !== "Non communiqué");

  return <section className="pd-supplier" id={id} aria-labelledby={`${idPrefix}-name`}>
    <div className="pd-supplier-head">
      <span className="pd-supplier-logo" aria-hidden="true">{supplier.initials}</span>
      <div className="pd-supplier-id">
        <h2 id={`${idPrefix}-name`}><Link href={supplier.profileHref || "/vendeurs"}>{supplier.name}</Link></h2>
        <p><Flag code={supplier.countryCode}/> {supplier.country} · {supplier.yearsActive} an{supplier.yearsActive > 1 ? "s" : ""} · {supplier.type}
          {supplier.verified ? <span className="pd-verified"><BadgeCheck size={14} strokeWidth={1.75} aria-hidden="true"/> Vérifié</span> : null}
        </p>
      </div>
    </div>
    <dl className="pd-supplier-metrics">
      {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
    </dl>
  </section>;
}
