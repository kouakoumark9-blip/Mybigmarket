"use client";

import { useActionState } from "react";
import { importCsvAction, type ImportState } from "@/app/gestion/actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importCsvAction, {});
  return <form action={action} className="gs-card gs-form" encType="multipart/form-data">
    {state.error && <div className="gs-msg gs-msg--err" role="alert">{state.error}</div>}
    {state.report && <div className={`gs-msg ${state.report.errors.length ? "gs-msg--warn" : "gs-msg--ok"}`} role="status">
      <b>{state.report.created} produit(s) créé(s).</b>
      {state.report.errors.length > 0 && <ul style={{ margin: "6px 0 0" }}>{state.report.errors.slice(0, 50).map((error) => <li key={`${error.line}-${error.message}`}>Ligne {error.line} : {error.message}</li>)}</ul>}
    </div>}
    <div className="gs-field"><label htmlFor="file">Fichier CSV</label><input id="file" name="file" type="file" accept=".csv,text/csv" required/></div>
    <div><button className="gs-btn" type="submit" disabled={pending}>{pending ? "Import en cours…" : "Importer les produits"}</button></div>
  </form>;
}
