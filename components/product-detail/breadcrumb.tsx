import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Product } from "@/lib/pdp/types";

export function Breadcrumb({ items, current }: { items: Product["breadcrumb"]; current: string }) {
  return <nav className="pd-breadcrumb" aria-label="Fil d'Ariane">
    <ol>
      {items.map((item) => <li key={`${item.href}-${item.label}`}><Link href={item.href}>{item.label}</Link><ChevronRight size={12} strokeWidth={1.5} aria-hidden="true"/></li>)}
      <li aria-current="page"><span>{current}</span></li>
    </ol>
  </nav>;
}
