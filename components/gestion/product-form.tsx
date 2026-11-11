"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { saveProductAction, type FormState } from "@/app/gestion/actions";
import { AVAILABILITY_OPTIONS } from "@/lib/shop/availability";

export type ProductFormValues = {
  id?: string; title: string; slug: string; categoryId: number | ""; brand: string; priceXof: number | ""; comparePriceXof: number | ""; quantity: number; availability: string; leadTimeDays: number;
  powerLabel: string; energyClass: string; badge: string; isBestSeller: boolean; isPlaceholder: boolean; status: string; shortDescription: string; description: string; specs: string;
  alibabaUrl: string; purchasePriceXof: number | ""; importFeesXof: number | ""; seoTitle: string; seoDescription: string;
  images: Array<{ id: number; url: string }>;
};

export const emptyProduct: ProductFormValues = { title: "", slug: "", categoryId: "", brand: "", priceXof: "", comparePriceXof: "", quantity: 0, availability: "in_stock_abidjan", leadTimeDays: 20, powerLabel: "", energyClass: "", badge: "", isBestSeller: false, isPlaceholder: false, status: "approved", shortDescription: "", description: "", specs: "", alibabaUrl: "", purchasePriceXof: "", importFeesXof: "", seoTitle: "", seoDescription: "", images: [] };

const money = new Intl.NumberFormat("fr-FR");

export function ProductForm({ values, categories }: { values: ProductFormValues; categories: Array<{ id: number; label: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProductAction, {});
  const [availability, setAvailability] = useState(values.availability);
  const [price, setPrice] = useState(String(values.priceXof));
  const [purchase, setPurchase] = useState(String(values.purchasePriceXof));
  const [fees, setFees] = useState(String(values.importFeesXof));
  const sale = Number(price.replace(/\s/g, "")) || 0;
  const cost = (Number(purchase.replace(/\s/g, "")) || 0) + (Number(fees.replace(/\s/g, "")) || 0);
  const margin = sale - cost;
  const hasCost = purchase !== "" || fees !== "";
  return <form action={action} className="gs-form" encType="multipart/form-data">
    {values.id && <input type="hidden" name="id" value={values.id}/>}
    {state.error && <div className="gs-msg gs-msg--err" role="alert">{state.error}</div>}
    {state.ok && <div className="gs-msg gs-msg--ok" role="status">{state.ok}</div>}
    {values.isPlaceholder && <div className="gs-msg gs-msg--warn">Cette fiche est fictive : elle est visible mais ne peut pas être commandée. Remplacez les informations, puis décochez « Fiche fictive » pour la mettre en vente.</div>}
    <div className="gs-card gs-form">
      <h2>Informations</h2>
      <div className="gs-grid">
        <div className="gs-field"><label htmlFor="title">Nom du produit</label><input id="title" name="title" defaultValue={values.title} required minLength={3}/></div>
        <div className="gs-field"><label htmlFor="categoryId">Catégorie</label><select id="categoryId" name="categoryId" defaultValue={values.categoryId} required><option value="">Choisir…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></div>
        <div className="gs-field"><label htmlFor="brand">Marque</label><input id="brand" name="brand" defaultValue={values.brand}/></div>
        <div className="gs-field"><label htmlFor="powerLabel">Puissance</label><input id="powerLabel" name="powerLabel" defaultValue={values.powerLabel} placeholder="12 000 BTU (1,5 CV)"/><small>Sert au filtre « Puissance ».</small></div>
        <div className="gs-field"><label htmlFor="energyClass">Classe énergétique</label><input id="energyClass" name="energyClass" defaultValue={values.energyClass} placeholder="A++" maxLength={4}/></div>
        <div className="gs-field"><label htmlFor="badge">Étiquette (facultatif)</label><input id="badge" name="badge" defaultValue={values.badge} placeholder="Nouveau" maxLength={30}/></div>
      </div>
      <div className="gs-field"><label htmlFor="shortDescription">Description courte</label><input id="shortDescription" name="shortDescription" defaultValue={values.shortDescription} maxLength={320}/></div>
      <div className="gs-field"><label htmlFor="description">Description</label><textarea id="description" name="description" defaultValue={values.description} required style={{ minHeight: 160 }}/></div>
      <div className="gs-field"><label htmlFor="specs">Caractéristiques</label><textarea id="specs" name="specs" defaultValue={values.specs} placeholder={"Puissance : 12 000 BTU\nGarantie : 1 an"}/><small>Une caractéristique par ligne, sous la forme « Nom : valeur ».</small></div>
    </div>
    <div className="gs-card gs-form">
      <h2>Prix, stock et livraison</h2>
      <div className="gs-grid">
        <div className="gs-field"><label htmlFor="priceXof">Prix de vente (FCFA)</label><input id="priceXof" name="priceXof" inputMode="numeric" defaultValue={values.priceXof} required onChange={(event) => setPrice(event.target.value)}/></div>
        <div className="gs-field"><label htmlFor="comparePriceXof">Ancien prix barré (FCFA)</label><input id="comparePriceXof" name="comparePriceXof" inputMode="numeric" defaultValue={values.comparePriceXof}/><small>Laissez vide s&apos;il n&apos;y a pas de promotion.</small></div>
        <div className="gs-field"><label htmlFor="availability">Disponibilité</label><select id="availability" name="availability" value={availability} onChange={(event) => setAvailability(event.target.value)}>{AVAILABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        {availability === "on_order" ? <div className="gs-field"><label htmlFor="leadTimeDays">Livraison sous (jours)</label><input id="leadTimeDays" name="leadTimeDays" type="number" min={1} max={365} defaultValue={values.leadTimeDays}/><small>Ce délai s&apos;affiche aux clients : n&apos;annoncez que ce que vous pouvez tenir.</small></div> : <input type="hidden" name="leadTimeDays" value={values.leadTimeDays}/>}
        <div className="gs-field"><label htmlFor="quantity">Quantité en stock</label><input id="quantity" name="quantity" type="number" min={0} defaultValue={values.quantity}/></div>
      </div>
      <label className="gs-check"><input type="checkbox" name="isBestSeller" defaultChecked={values.isBestSeller}/> Afficher dans « Meilleures ventes »</label>
    </div>
    <div className="gs-card gs-form">
      <h2>Photos</h2>
      {values.images.length > 0 && <div className="gs-thumbs">{values.images.map((image) => <label key={image.id} className="gs-thumb"><Image src={image.url} alt="" width={96} height={96} unoptimized/><span className="gs-check"><input type="checkbox" name="removeImage" value={image.id}/> Retirer</span></label>)}</div>}
      <div className="gs-field"><label htmlFor="photos">Ajouter des photos</label><input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple/><small>JPG, PNG ou WebP, 5 Mo maximum chacune. La première photo est l&apos;image principale.</small></div>
    </div>
    <div className="gs-internal gs-form">
      <h2>Champs internes : jamais visibles par les clients</h2>
      <div className="gs-grid">
        <div className="gs-field"><label htmlFor="alibabaUrl">Lien du produit sur Alibaba</label><input id="alibabaUrl" name="alibabaUrl" type="url" defaultValue={values.alibabaUrl} placeholder="https://…"/></div>
        <div className="gs-field"><label htmlFor="purchasePriceXof">Prix d&apos;achat (FCFA)</label><input id="purchasePriceXof" name="purchasePriceXof" inputMode="numeric" defaultValue={values.purchasePriceXof} onChange={(event) => setPurchase(event.target.value)}/></div>
        <div className="gs-field"><label htmlFor="importFeesXof">Frais d&apos;importation (FCFA)</label><input id="importFeesXof" name="importFeesXof" inputMode="numeric" defaultValue={values.importFeesXof} onChange={(event) => setFees(event.target.value)}/></div>
      </div>
      <p style={{ margin: 0 }}><b>Marge estimée :</b> {hasCost ? `${money.format(margin)} FCFA par produit${sale ? ` (${Math.round((margin / sale) * 100)} % du prix de vente)` : ""}` : "renseignez le prix d'achat et les frais"}</p>
    </div>
    <div className="gs-card gs-form">
      <h2>Publication et référencement</h2>
      <div className="gs-grid">
        <div className="gs-field"><label htmlFor="status">État</label><select id="status" name="status" defaultValue={values.status === "approved" ? "approved" : "draft"}><option value="approved">En ligne</option><option value="draft">Brouillon (masqué)</option></select></div>
        <div className="gs-field"><label htmlFor="slug">Adresse de la page</label><input id="slug" name="slug" defaultValue={values.slug} placeholder="automatique"/><small>Laissez vide : elle est créée à partir du nom.</small></div>
      </div>
      <div className="gs-field"><label htmlFor="seoTitle">Titre pour Google (facultatif)</label><input id="seoTitle" name="seoTitle" defaultValue={values.seoTitle} maxLength={190}/></div>
      <div className="gs-field"><label htmlFor="seoDescription">Description pour Google (facultatif)</label><input id="seoDescription" name="seoDescription" defaultValue={values.seoDescription} maxLength={320}/></div>
      <label className="gs-check"><input type="checkbox" name="isPlaceholder" defaultChecked={values.isPlaceholder}/> Fiche fictive (visible, mais non commandable)</label>
    </div>
    <div className="gs-actions"><button className="gs-btn" type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le produit"}</button></div>
  </form>;
}
