import type { LabeledValue } from "@/lib/pdp/types";

export function SpecsGrid({ items, title = "Caractéristiques" }: { items: LabeledValue[]; title?: string }) {
  if (!items.length) return null;
  return <section className="pd-block" aria-labelledby="pd-specs-title">
    <h3 id="pd-specs-title" className="pd-block-title">{title}</h3>
    <dl className="pd-specs">
      {items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
    </dl>
  </section>;
}
