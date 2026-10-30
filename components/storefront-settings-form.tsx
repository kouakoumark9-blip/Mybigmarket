"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Save, Store } from "lucide-react";
import { saveStorefrontAction } from "@/actions/storefront";

type StorefrontValues = { storeName: string; slug: string; headline: string; description: string; announcement: string; isPublished: boolean };
export function StorefrontSettingsForm({ initial }: { initial: StorefrontValues }) {
  const [state, action, pending] = useActionState(saveStorefrontAction, {});
  const [previewName, setPreviewName] = useState(initial.storeName);
  const [previewHeadline, setPreviewHeadline] = useState(initial.headline);
  return <div className="storefront-settings-layout">
    <form action={action} className="account-panel seller-form storefront-settings-form">
      <div className="storefront-form-title"><span className="storefront-form-icon"><Store size={20}/></span><div><span className="eyebrow">VITRINE DU VENDEUR</span><h2>Personnaliser ma boutique</h2></div></div>
      <p>Présentez votre sélection dans une page publique liée à votre profil mybigmarket. Vos produits doivent être validés pour y apparaître.</p>
      <div className="form-grid">
        <div className="field"><label htmlFor="store-name">Nom de la boutique</label><input id="store-name" name="storeName" required minLength={2} maxLength={120} defaultValue={initial.storeName} onChange={(event) => setPreviewName(event.target.value)}/></div>
        <div className="field"><label htmlFor="store-slug">Adresse publique</label><div className="store-slug-input"><span>mybigmarket.ci/boutiques/</span><input id="store-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} defaultValue={initial.slug} aria-describedby="store-slug-help"/></div><small id="store-slug-help" className="field-hint">Minuscules, chiffres et tirets uniquement.</small></div>
        <div className="field full"><label htmlFor="store-headline">Phrase de présentation</label><input id="store-headline" name="headline" required minLength={3} maxLength={190} defaultValue={initial.headline} onChange={(event) => setPreviewHeadline(event.target.value)}/></div>
        <div className="field full"><label htmlFor="store-description">À propos de ma boutique</label><textarea id="store-description" name="description" maxLength={1500} defaultValue={initial.description} placeholder="Présentez votre sélection, vos spécialités et votre manière de travailler…"/></div>
        <div className="field full"><label htmlFor="store-announcement">Annonce en haut de boutique (facultatif)</label><input id="store-announcement" name="announcement" maxLength={200} defaultValue={initial.announcement} placeholder="Ex. Nouvelle sélection disponible pour le mois d’octobre"/></div>
        <label className="store-publish-toggle"><input type="checkbox" name="isPublished" defaultChecked={initial.isPublished}/><span><b>Publier ma boutique</b><small>La page sera accessible via son adresse publique.</small></span></label>
      </div>
      {state.error && <div className="form-error" role="alert">{state.error}</div>}
      {state.success && <div className="form-success" role="status">{state.success}{state.slug && <Link href={`/boutiques/${state.slug}`} target="_blank" rel="noreferrer">Voir la boutique <ArrowUpRight size={14}/></Link>}</div>}
      <button className="button button-primary" type="submit" disabled={pending}><Save size={15}/>{pending ? "Enregistrement…" : "Enregistrer les réglages"}</button>
    </form>
    <aside className="storefront-preview-card"><span className="eyebrow">APERÇU EN DIRECT</span><div className="storefront-preview-banner"><Store size={25}/><span className="storefront-preview-avatar">{initial.storeName.slice(0,2).toUpperCase()}</span></div><h3>{previewName || "Nom de la boutique"}</h3><p>{previewHeadline || "Phrase de présentation"}</p><small>Guangzhou, Chine · Boutique mybigmarket</small><div className="storefront-preview-products"><i/><i/><i/></div><div className="storefront-preview-caption">Aperçu indicatif · enregistré après connexion Neon</div></aside>
  </div>;
}
