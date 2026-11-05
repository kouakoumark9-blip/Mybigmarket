"use client";

import { useActionState } from "react";
import { Search, Sparkles } from "lucide-react";
import { naturalSearchAction, salesSummaryAction, type SearchState, type SummaryState } from "./actions";

const ENTITY_LABELS: Record<string, string> = { products: "Produits", orders: "Commandes", customers: "Clients", tickets: "Tickets" };
const LINKS: Record<string, (row: Record<string, unknown>) => string | null> = {
  products: (row) => (row.id ? `/catalogue/produits/${row.id}` : null),
  orders: (row) => (row.id ? `/commandes/${row.id}` : null),
  tickets: (row) => (row.id ? `/service-client/tickets/${row.id}` : null),
  customers: () => null,
};
const label = (row: Record<string, unknown>) => String(row.title ?? row.subject ?? row.reference ?? row.name ?? row.email ?? row.id ?? "—");
const detail = (row: Record<string, unknown>) => [row.reference && row.title ? row.reference : null, row.status, row.email, typeof row.totalXof === "number" ? `${new Intl.NumberFormat("fr-FR").format(row.totalXof)} FCFA` : null, typeof row.priceXof === "number" ? `${new Intl.NumberFormat("fr-FR").format(row.priceXof)} FCFA` : null].filter(Boolean).join(" · ");

export function SalesSummaryTool() {
  const [state, action, pending] = useActionState<SummaryState, FormData>(salesSummaryAction, {});
  return <div>
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm"><span className="font-semibold text-slate-700">Du</span><input type="date" name="from" className="ui-input"/></label>
      <label className="grid gap-1 text-sm"><span className="font-semibold text-slate-700">Au</span><input type="date" name="to" className="ui-input"/></label>
      <button className="ui-button ui-button-primary" disabled={pending}><Sparkles size={15}/> {pending ? "Rédaction…" : "Résumer les ventes"}</button>
    </form>
    <p className="mt-2 text-xs text-slate-500">Sans dates : les 30 derniers jours. L’assistant ne reçoit que les chiffres agrégés, aucune donnée client.</p>
    {state.error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
    {state.result && <div className="mt-4 rounded-lg border border-slate-200 p-4 text-sm leading-6">
      <p className="mb-2 font-bold text-slate-950">{state.result.summary.headline}</p>
      {[["Points forts", state.result.summary.highlights], ["Points d’attention", state.result.summary.concerns], ["Pistes", state.result.summary.suggestions]].map(([title, items]) => (items as string[]).length ? <div key={String(title)} className="mt-2"><b className="text-xs uppercase tracking-wide text-slate-500">{title}</b><ul className="ml-4 list-disc">{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul></div> : null)}
      <p className="mt-3 text-xs text-slate-500">Période : {state.result.from} → {state.result.to}</p>
    </div>}
  </div>;
}

export function NaturalSearchTool() {
  const [state, action, pending] = useActionState<SearchState, FormData>(naturalSearchAction, {});
  return <div>
    <form action={action} className="flex flex-wrap gap-3">
      <input name="question" required minLength={3} maxLength={500} placeholder="Ex. commandes expédiées cette semaine, tickets urgents non assignés…" className="ui-input min-w-[280px] flex-1"/>
      <button className="ui-button ui-button-primary" disabled={pending}><Search size={15}/> {pending ? "Recherche…" : "Chercher"}</button>
    </form>
    <p className="mt-2 text-xs text-slate-500">L’assistant ne voit aucune donnée : il traduit votre question en filtres, exécutés avec vos droits.</p>
    {state.error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{state.error}</p>}
    {state.result && <div className="mt-4 text-sm">
      <p className="mb-2 text-slate-700"><b>{ENTITY_LABELS[state.result.entity] ?? state.result.entity}</b> · {state.result.explanation} <span className="text-slate-500">({state.result.meta.total} résultat{state.result.meta.total > 1 ? "s" : ""})</span></p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{state.result.results.map((row, index) => {
        const href = LINKS[state.result!.entity]?.(row);
        return <li key={String(row.id ?? index)} className="px-3 py-2">{href ? <a href={href} className="font-semibold text-slate-950 hover:underline">{label(row)}</a> : <span className="font-semibold">{label(row)}</span>}<span className="ml-2 text-xs text-slate-500">{detail(row)}</span></li>;
      })}</ul>
      <p className="mt-2 font-mono text-[11px] text-slate-400">{state.result.apiPath}</p>
    </div>}
  </div>;
}
