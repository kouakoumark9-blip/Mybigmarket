import type { ProductAttribute } from "@/lib/product";

export function KeyAttributes({ items }: { items: ProductAttribute[] }) {
  return <section className="pdp-key-attributes" aria-labelledby="pdp-key-attributes-title">
    <h2 id="pdp-key-attributes-title" className="sr-only">Caractéristiques clés</h2>
    {items.map((item) => <div className="pdp-key-attribute" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
  </section>;
}
