"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Sparkles, X } from "lucide-react";
import type { Supplier } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";
import { Stars } from "@/components/product-detail/shared";

function Flag({ code }: { code: string }) {
  return <span className="pd-flag" aria-hidden="true">{code}</span>;
}

export function SupplierCard({ supplier, id, idPrefix = "pd-supplier" }: { supplier: Supplier; id?: string; idPrefix?: string }) {
  const [reportOpen, setReportOpen] = useState(false);
  const rating = supplier.rating.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const metrics = [
    { label: "Chiffre d'affaires en ligne", value: supplier.onlineRevenue },
    { label: "Temps de réponse", value: supplier.responseTime },
    { label: "Expédition dans les délais", value: supplier.onTimeShipping ? `${supplier.onTimeShipping} %` : "Non communiqué" },
    { label: "Note de la boutique", value: <>{rating}/5 <small>({supplier.ratingCount.toLocaleString("fr-FR")})</small></> },
  ].filter((metric) => metric.value !== "Non communiqué");

  return <section className="pd-supplier" id={id} aria-labelledby={`${idPrefix}-name`}>
    <div className="pd-supplier-head">
      <span className="pd-supplier-logo" aria-hidden="true">{supplier.initials}</span>
      <div className="pd-supplier-id">
        <h2 id={`${idPrefix}-name`}><Link href={supplier.profileHref || "/vendeurs"}>{supplier.name}</Link></h2>
        <p><Flag code={supplier.countryCode}/> {supplier.country} · {supplier.yearsActive} an{supplier.yearsActive > 1 ? "s" : ""} · {supplier.type}
          {supplier.verified ? <span className="pd-verified"><BadgeCheck size={14} strokeWidth={1.75} aria-hidden="true"/> Vérifié</span> : <span className="pd-unverified">Non vérifié</span>}
        </p>
      </div>
    </div>
    <dl className="pd-supplier-metrics">
      {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
    </dl>
    <div className="pd-supplier-verify">
      <span><Sparkles size={15} strokeWidth={1.75} className="pd-spark" aria-hidden="true"/> {pdpConfig.supplierVerification}</span>
      <button type="button" className="pd-link-button" onClick={() => setReportOpen(true)}>{pdpConfig.supplierReport} <ChevronRight size={14} strokeWidth={1.5}/></button>
    </div>

    {reportOpen && <div className="pd-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
      <div className="pd-modal" role="dialog" aria-modal="true" aria-labelledby="pd-report-title">
        <header className="pd-modal-head"><h2 id="pd-report-title">Rapport fournisseur</h2><button type="button" onClick={() => setReportOpen(false)} aria-label="Fermer" autoFocus><X size={20} strokeWidth={1.5}/></button></header>
        <p className="pd-modal-lead"><b>{supplier.name}</b> · {supplier.type} · {supplier.country}</p>
        <ul className="pd-report-list">
          <li><span>Ancienneté sur la plateforme</span><b>{supplier.yearsActive} an{supplier.yearsActive > 1 ? "s" : ""}</b></li>
          {metrics.map((metric) => <li key={metric.label}><span>{metric.label}</span><b>{metric.value}</b></li>)}
          <li><span>Avis</span><b><Stars value={supplier.rating} size={13}/></b></li>
          <li><span>Statut de vérification</span><b>{supplier.verified ? "Vérifié" : "Non vérifié"}</b></li>
        </ul>
        <p className="pd-modal-note">Rapport généré à partir des informations déclarées sur le profil. Vérifiez les conditions directement avec le fournisseur avant toute commande importante.</p>
      </div>
    </div>}
  </section>;
}
