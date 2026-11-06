"use client";

import type { LabeledValue } from "@/lib/pdp/types";
import { useCountryPreferences } from "@/components/country-preferences";

export function SpecsGrid({ items, title }: { items: LabeledValue[]; title?: string }) {
  const { tr } = useCountryPreferences();
  if (!items.length) return null;
  return <section className="pd-block" aria-labelledby="pd-specs-title">
    <h3 id="pd-specs-title" className="pd-block-title">{title ?? tr("Caractéristiques")}</h3>
    <dl className="pd-specs">
      {items.map((item) => <div key={item.label}><dt>{tr(item.label)}</dt><dd>{tr(item.value)}</dd></div>)}
    </dl>
  </section>;
}
