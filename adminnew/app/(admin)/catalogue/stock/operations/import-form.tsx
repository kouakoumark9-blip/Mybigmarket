"use client";

import { useActionState } from "react";
import { importAction, type ImportState } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, {});
  return <div className="grid gap-4">
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Fichier CSV</span><input type="file" name="file" accept=".csv,text/csv" className="ui-input py-1.5"/></label>
      <label className="grid gap-1.5 text-sm"><span className="font-semibold text-slate-700">Mode</span><select name="mode" className="ui-input"><option value="set">Inventaire : la quantité remplace le stock physique</option><option value="add">Entrée : la quantité s’ajoute au stock</option></select></label>
      <p className="text-xs leading-5 text-slate-500 md:col-span-2">Colonnes : <code>reference</code>, <code>sku</code> ou <code>ean13</code> (au moins une), <code>sku_declinaison</code> (facultatif), <code>quantite</code>, <code>entrepot</code> (code, facultatif). Séparateur « ; » ou « , ».</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2"><input type="checkbox" name="apply"/> Appliquer réellement (sinon simple simulation, sans aucune modification)</label>
      <div className="md:col-span-2"><button type="submit" disabled={pending} className="ui-button ui-button-primary">{pending ? "Traitement…" : "Lancer"}</button></div>
    </form>
    {state.error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">{state.error}</p>}
    {state.result && <div className="rounded-lg border border-slate-200">
      <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">{state.result.dryRun ? "Simulation (rien n’a été modifié)" : state.result.summary.errors ? "Import refusé : aucune ligne appliquée" : "Import appliqué"} — {state.result.summary.lines} ligne(s) : {state.result.summary.ok} à jour, {state.result.summary.unchanged} inchangée(s), {state.result.summary.errors} en erreur.</p>
      <div className="admin-table-wrap max-h-96 overflow-auto"><table className="admin-table min-w-[640px]"><thead><tr><th>Ligne</th><th>Résultat</th><th>Entrepôt</th><th>Avant → après</th><th>Message</th></tr></thead><tbody>{state.result.report.map((line) => <tr key={line.line}><td>{line.line}</td><td className={line.status === "error" ? "font-semibold text-red-700" : "font-semibold"}>{line.status === "ok" ? "OK" : line.status === "unchanged" ? "Inchangée" : "Erreur"}</td><td>{line.warehouse ?? "défaut"}</td><td>{line.before ?? "—"} → {line.after ?? "—"}</td><td className="text-xs">{line.message ?? ""}</td></tr>)}</tbody></table></div>
    </div>}
  </div>;
}
