"use client";

import { useActionState } from "react";
import { saveCategoryAction, type FormState } from "@/app/gestion/actions";

export type CategoryValues = { id: number; name: string; slug: string; introText: string; bodyText: string; metaTitle: string; metaDescription: string; faq: string };

export function CategoryForm({ values }: { values: CategoryValues }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCategoryAction, {});
  return <form action={action} className="gs-card gs-form">
    <h2>{values.name} <small style={{ fontWeight: 400, color: "#5b6577" }}>/{values.slug}</small></h2>
    <input type="hidden" name="id" value={values.id}/>
    {state.error && <div className="gs-msg gs-msg--err" role="alert">{state.error}</div>}
    {state.ok && <div className="gs-msg gs-msg--ok" role="status">{state.ok}</div>}
    <div className="gs-field"><label htmlFor={`m-${values.id}`}>Titre pour Google</label><input id={`m-${values.id}`} name="metaTitle" defaultValue={values.metaTitle} maxLength={190}/><small>Ex. : Climatiseurs à Abidjan : split, inverter | MyBigMarket</small></div>
    <div className="gs-field"><label htmlFor={`d-${values.id}`}>Description pour Google</label><input id={`d-${values.id}`} name="metaDescription" defaultValue={values.metaDescription} maxLength={320}/></div>
    <div className="gs-field"><label htmlFor={`i-${values.id}`}>Texte d&apos;introduction (haut de page)</label><textarea id={`i-${values.id}`} name="introText" defaultValue={values.introText}/></div>
    <div className="gs-field"><label htmlFor={`b-${values.id}`}>Texte explicatif (bas de page)</label><textarea id={`b-${values.id}`} name="bodyText" defaultValue={values.bodyText} style={{ minHeight: 160 }}/><small>Séparez les paragraphes par une ligne vide.</small></div>
    <div className="gs-field"><label htmlFor={`f-${values.id}`}>Questions fréquentes</label><textarea id={`f-${values.id}`} name="faq" defaultValue={values.faq} style={{ minHeight: 160 }}/><small>Une question sur la première ligne, la réponse sur la ligne suivante, puis une ligne vide avant la question suivante.</small></div>
    <div><button className="gs-btn" type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button></div>
  </form>;
}
