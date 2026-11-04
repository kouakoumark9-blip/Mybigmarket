import { ChevronDown } from "lucide-react";
import type { FaqItem } from "@/lib/pdp/types";

export function FaqBlock({ items, id = "pdp-faq" }: { items: FaqItem[]; id?: string }) {
  if (!items.length) return null;
  return <section className="pd-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="pd-section-title">Questions fréquentes</h2>
    <div className="pd-faq">
      {items.map((item, index) => <details key={item.question} open={index === 0}>
        <summary><h3>{item.question}</h3><ChevronDown size={18} strokeWidth={1.5} aria-hidden="true"/></summary>
        <p>{item.answer}</p>
      </details>)}
    </div>
  </section>;
}
