import Link from "next/link";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return <nav aria-label="Fil d'Ariane"><ol className="mb-crumbs">
    {items.map((item, index) => <li key={item.label} aria-current={index === items.length - 1 ? "page" : undefined}>{item.href && index < items.length - 1 ? <Link href={item.href}>{item.label}</Link> : item.label}</li>)}
  </ol></nav>;
}

/** Données structurées schema.ts BreadcrumbList. */
export function breadcrumbJsonLd(items: Crumb[], base: string) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.label, ...(item.href ? { item: `${base}${item.href}` } : {}) })) };
}
