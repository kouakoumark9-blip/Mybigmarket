"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Save, Store } from "lucide-react";
import type { MockStorefront } from "@/lib/demo-backend";

export function DemoStorefrontSettings({ sellerId }: { sellerId: string }) {
  const [store, setStore] = useState<MockStorefront | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/demo-backend/storefront?sellerId=${encodeURIComponent(sellerId)}`, { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Impossible de charger la boutique démo."); return payload.storefront as MockStorefront; })
      .then((value) => { if (active) setStore(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Erreur de chargement."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sellerId]);
  function change<K extends keyof MockStorefront>(key: K, value: MockStorefront[K]) {
    setStore((current) => current ? { ...current, [key]: value } : current);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/demo-backend/storefront", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(store) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible d’enregistrer les réglages.");
      setStore(payload.storefront as MockStorefront);
      setNotice("Réglages fictifs enregistrés dans le serveur de démonstration.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur d’enregistrement."); }
    finally { setSaving(false); }
  }
  if (loading) return <div className="demo-empty-state">Chargement de la boutique…</div>;
  if (!store) return <div className="form-error" role="alert">{error || "Boutique fictive indisponible."}</div>;
  return <section className="demo-store-settings">
    <div className="demo-store-settings-heading"><div><span className="eyebrow">OUTIL VENDEUR</span><h2><Store size={17}/> Personnaliser ma boutique</h2></div><span className={store.isPublished ? "demo-publish-status published" : "demo-publish-status"}>{store.isPublished ? "Publiée" : "Brouillon"}</span></div>
    <p>Modifie le nom, l’adresse et le contenu de ta vitrine publique. Les changements sont partagés entre les profils fictifs dans cette simulation.</p>
    <form onSubmit={save}>
      <div className="demo-store-settings-grid"><label>Nom de la boutique<input value={store.storeName} maxLength={120} onChange={(event) => change("storeName", event.target.value)} required/></label><label>Adresse publique<span className="demo-store-slug"><small>/boutiques/</small><input value={store.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} onChange={(event) => change("slug", event.target.value.toLowerCase())} required/></span></label><label className="demo-store-wide">Phrase d’accroche<input value={store.headline} maxLength={190} onChange={(event) => change("headline", event.target.value)} required/></label><label className="demo-store-wide">Description<textarea value={store.description} maxLength={1500} onChange={(event) => change("description", event.target.value)}/></label><label className="demo-store-wide">Annonce<input value={store.announcement} maxLength={200} onChange={(event) => change("announcement", event.target.value)}/></label></div>
      <label className="demo-store-publish"><input type="checkbox" checked={store.isPublished} onChange={(event) => change("isPublished", event.target.checked)}/><span><b>Publier la boutique</b><small>La page sera visible à son adresse publique.</small></span></label>
      {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="demo-backend-success" role="status">{notice}</div>}
      <div className="demo-store-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"} <Save size={14}/></button>{store.isPublished && <Link className="button button-outline" href={`/demo-backend/storefront-preview?sellerId=${encodeURIComponent(sellerId)}`} target="_blank"><ArrowUpRight size={14}/> Voir ma vitrine</Link>}</div>
    </form>
  </section>;
}
