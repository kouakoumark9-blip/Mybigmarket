"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Product } from "@/lib/pdp/types";
import { useCountryPreferences } from "@/components/country-preferences";

export function Breadcrumb({ items, current }: { items: Product["breadcrumb"]; current: string }) {
  const { tr } = useCountryPreferences();
  return <nav className="pd-breadcrumb" aria-label={tr("Fil d'Ariane")}>
    <ol>
      {items.map((item) => <li key={`${item.href}-${item.label}`}><Link href={item.href}>{tr(item.label)}</Link><ChevronRight size={12} strokeWidth={1.5} aria-hidden="true"/></li>)}
      <li aria-current="page"><span>{current}</span></li>
    </ol>
  </nav>;
}
