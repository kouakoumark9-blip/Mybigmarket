"use client";

import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/lib/pdp/types";
import { useCountryPreferences } from "@/components/country-preferences";

export function FaqBlock({ items, id = "pdp-faq" }: { items: FaqItem[]; id?: string }) {
  const { tr } = useCountryPreferences();
  if (!items.length) return null;
  return <section className="pd-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="pd-section-title">{tr("Questions fréquentes")}</h2>
    <div className="pd-faq">
      {items.map((item, index) => <details key={item.question} open={index === 0}>
        <summary><h3>{tr(item.question)}</h3><ChevronDown size={18} strokeWidth={1.5} aria-hidden="true"/></summary>
        <p>{tr(item.answer)}</p>
      </details>)}
    </div>
  </section>;
}
