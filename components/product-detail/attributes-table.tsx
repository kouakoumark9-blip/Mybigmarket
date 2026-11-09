"use client";

import { Fragment, useState } from "react";
import type { LabeledValue } from "@/lib/pdp/types";
import { pdpConfig } from "@/lib/pdp/config";

function Value({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const limit = pdpConfig.attributeTruncate;
  if (value.length <= limit) return <>{value}</>;
  return <>{open ? value : `${value.slice(0, limit).trimEnd()}…`} <button type="button" className="pd-link-button pd-see-more" onClick={() => setOpen((current) => !current)} aria-expanded={open}>{open ? "Voir moins" : "Voir plus"}</button></>;
}

export function AttributesTable({ items, id, title = "Caractéristiques du produit" }: { items: LabeledValue[]; id: string; title?: string }) {
  const rows = Array.from({ length: Math.ceil(items.length / 2) }, (_, index) => items.slice(index * 2, index * 2 + 2));
  return <section className="pd-section" id={id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className="pd-section-title">{title}</h2>
    <div className="pd-table-scroll">
      <table className="pd-attributes">
        <caption className="sr-only">{title}</caption>
        <tbody>
          {rows.map((row, index) => <tr key={index}>
            {row.map((item) => <Fragment key={item.label}><th scope="row">{item.label}</th><td><Value value={item.value}/></td></Fragment>)}
            {row.length === 1 && <><th aria-hidden="true"/><td aria-hidden="true"/></>}
          </tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
