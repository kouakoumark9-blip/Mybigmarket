"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleUserRound, Database, MessageCircle, RefreshCw, Send, Server, ShieldCheck } from "lucide-react";
import { MOCK_ACTORS, type MockQuoteRequest, type MockRole, type MockRequestStatus } from "@/lib/demo-backend";
import { DemoStorefrontSettings } from "@/components/demo-storefront-settings";
import { DemoSellerAnalytics } from "@/components/demo-seller-analytics";

const roleLabel: Record<MockRole, string> = { buyer: "Acheteur", seller: "Vendeur", admin: "Administration" };
const statusLabel: Record<MockRequestStatus, string> = { new: "Nouvelle", in_review: "En cours", quoted: "Réponse envoyée", closed: "Clôturée" };
const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
async function fetchMockRequests(role: MockRole, actorId: string) {
  const response = await fetch(`/api/demo-backend/requests?role=${role}&actorId=${encodeURIComponent(actorId)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Le backend de démonstration ne répond pas.");
  return payload.requests as MockQuoteRequest[];
}

export function DemoBackendWorkbench() {
  const [role, setRole] = useState<MockRole>("buyer");
  const [actorId, setActorId] = useState<string>(MOCK_ACTORS.buyer[0].id);
  const [requests, setRequests] = useState<MockQuoteRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const actors = MOCK_ACTORS[role];
  const selected = useMemo(() => requests.find((request) => request.id === selectedId) || requests[0] || null, [requests, selectedId]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchMockRequests(role, actorId);
      setRequests(rows);
      setSelectedId((current) => rows.some((request) => request.id === current) ? current : rows[0]?.id || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur de connexion au backend de démonstration.");
    } finally { setLoading(false); }
  }, [role, actorId]);

  useEffect(() => {
    let active = true;
    fetchMockRequests(role, actorId).then((rows) => {
      if (!active) return;
      setRequests(rows);
      setSelectedId((current) => rows.some((request) => request.id === current) ? current : rows[0]?.id || null);
      setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Erreur de connexion au backend de démonstration.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [role, actorId]);
  function changeRole(nextRole: MockRole) {
    setLoading(true);
    setRole(nextRole);
    setActorId(MOCK_ACTORS[nextRole][0].id);
    setSuccess("");
  }
  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(""); setSuccess("");
    const values = new FormData(form);
    try {
      const response = await fetch("/api/demo-backend/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        role, actorId, kind: values.get("kind"), productTitle: values.get("productTitle"), quantity: Number(values.get("quantity")),
        destination: values.get("destination"), contactPhone: values.get("contactPhone"), message: values.get("message"),
      }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Impossible de créer la demande.");
      form.reset();
      setSuccess(`Demande ${payload.request.id} créée. Elle est visible dans les autres profils de démonstration.`);
      await loadRequests();
      setSelectedId(payload.request.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur de création."); }
    finally { setBusy(false); }
  }
  async function updateStatus(status: MockRequestStatus) {
    if (!selected) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/demo-backend/requests/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, actorId, status }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Mise à jour refusée.");
      setSuccess(`Le statut de ${selected.id} a été modifié : ${statusLabel[status]}.`);
      await loadRequests();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur de mise à jour."); }
    finally { setBusy(false); }
  }
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || (role !== "buyer" && role !== "seller")) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const body = String(values.get("body") || "");
    if (!body.trim()) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/demo-backend/requests/${encodeURIComponent(selected.id)}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, actorId, body }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Message non envoyé.");
      form.reset();
      setSuccess("Message ajouté à la conversation fictive.");
      await loadRequests();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur d’envoi."); }
    finally { setBusy(false); }
  }
  async function resetDemo() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/demo-backend/reset", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Réinitialisation impossible.");
      setSuccess("Les données de démonstration ont été restaurées.");
      await loadRequests();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Erreur de réinitialisation."); }
    finally { setBusy(false); }
  }

  return <main className="shell page-space demo-backend-page">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Simulation du backend</span></div>
    <Link className="back-link" href="/produits"><ArrowLeft size={15}/> Retour au catalogue</Link>
    <div className="demo-backend-heading"><div><span className="eyebrow">ENVIRONNEMENT FICTIF · API DE DÉMONSTRATION</span><h1 className="page-title">Back-office mybigmarket</h1><p className="page-subtitle">Teste le parcours d’une demande de devis entre acheteur, vendeur et administration.</p></div><span className="demo-backend-live"><i/> API simulée</span></div>
    <div className="demo-backend-warning"><ShieldCheck size={18}/><span><b>Simulation uniquement.</b> Les données résident en mémoire dans ce serveur de prévisualisation, sont réinitialisées au redémarrage et ne sont ni reliées à Neon ni transmises à de vrais utilisateurs. L’API de démo est désactivée en production.</span></div>
    <div className="demo-backend-stats"><div><Database size={17}/><span><b>{requests.length}</b><small>Demandes visibles</small></span></div><div><MessageCircle size={17}/><span><b>{requests.reduce((sum, request) => sum + request.messages.length, 0)}</b><small>Messages de démo</small></span></div><div><Server size={17}/><span><b>5</b><small>Routes API simulées</small></span></div></div>
    <section className="demo-backend-panel">
      <div className="demo-backend-toolbar"><div className="demo-role-tabs" role="tablist" aria-label="Profil simulé">{(["buyer", "seller", "admin"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={role === value} className={role === value ? "active" : ""} onClick={() => changeRole(value)}><CircleUserRound size={15}/>{roleLabel[value]}</button>)}</div><div className="demo-backend-profile"><label htmlFor="demo-actor">Profil de test</label><select id="demo-actor" value={actorId} onChange={(event) => { setLoading(true); setActorId(event.target.value); }}>{actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></div><button type="button" className="button button-outline demo-reset-button" onClick={resetDemo} disabled={busy}><RefreshCw size={14}/> Réinitialiser</button></div>
      {success && <div className="demo-backend-success" role="status"><CheckCircle2 size={15}/>{success}</div>}{error && <div className="form-error" role="alert">{error}</div>}
      <div className="demo-backend-content">
        <aside className="demo-request-list"><div className="demo-list-title"><div><span className="eyebrow">{roleLabel[role].toUpperCase()}</span><h2>Demandes</h2></div><button type="button" aria-label="Actualiser" onClick={() => void loadRequests()} disabled={loading}><RefreshCw size={15}/></button></div>
          {loading ? <p className="demo-empty-state">Chargement des données…</p> : requests.length === 0 ? <p className="demo-empty-state">Aucune demande dans ce profil de test.</p> : requests.map((request) => <button key={request.id} type="button" className={`demo-request-row ${selected?.id === request.id ? "selected" : ""}`} onClick={() => setSelectedId(request.id)}><span className="demo-request-row-top"><small>{request.kind === "product" ? "DEVIS PRODUIT" : "SOURCING"}</small><i className={`quote-status quote-status-${request.status}`}>{statusLabel[request.status]}</i></span><b>{request.productTitle}</b><span>{role === "buyer" ? request.sellerName || "Équipe sourcing" : request.buyerName} · {request.quantity.toLocaleString("fr-FR")} unités</span></button>)}
        </aside>
        <div className="demo-backend-detail">
          {role === "buyer" && <form className="demo-create-form" onSubmit={createRequest}><div className="demo-create-heading"><div><span className="eyebrow">NOUVELLE ENTRÉE</span><h2>Créer une demande test</h2></div></div><div className="demo-create-grid"><label>Type<select name="kind"><option value="product">Devis produit</option><option value="sourcing">Sourcing</option></select></label><label>Quantité<input name="quantity" type="number" min="1" max="1000000" defaultValue="50" required/></label><label className="demo-field-wide">Produit recherché<input name="productTitle" minLength={2} maxLength={190} placeholder="Ex. lots de gourdes inox" required/></label><label>Destination<select name="destination"><option>Abidjan</option><option>Bouaké</option><option>Yamoussoukro</option></select></label><label>Téléphone<input name="contactPhone" minLength={8} maxLength={32} defaultValue="+225 07 00 00 00 00" required/></label><label className="demo-field-wide">Détails<textarea name="message" maxLength={2000} placeholder="Spécifications ou délai souhaité"/></label></div><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Traitement…" : "Envoyer la demande test"} <Send size={14}/></button></form>}
          {role === "seller" && <><DemoStorefrontSettings sellerId={actorId}/><DemoSellerAnalytics/></>}
          {selected ? <article className="demo-request-detail"><div className="demo-detail-heading"><div><span className="eyebrow">RÉF. {selected.id}</span><h2>{selected.productTitle}</h2></div><span className={`quote-status quote-status-${selected.status}`}>{statusLabel[selected.status]}</span></div><div className="demo-detail-meta"><span>Type <b>{selected.kind === "product" ? "Devis produit" : "Sourcing"}</b></span><span>Acheteur <b>{selected.buyerName}</b></span><span>{selected.sellerName ? "Vendeur" : "Assignation"} <b>{selected.sellerName || "Équipe mybigmarket"}</b></span><span>Quantité <b>{selected.quantity.toLocaleString("fr-FR")}</b></span><span>Destination <b>{selected.destination}</b></span><span>Téléphone <b>{selected.contactPhone}</b></span></div>{selected.message && <p className="demo-detail-message">{selected.message}</p>}<small className="demo-created-at">Créée le {formatDate(selected.createdAt)}</small>
            {(role === "seller" || role === "admin") && selected.status !== "closed" && <div className="demo-status-actions"><span>Mettre à jour le statut</span>{(["in_review", "quoted", "closed"] as const).map((status) => <button key={status} type="button" className={status === selected.status ? "active" : ""} disabled={busy || (role === "seller" && selected.sellerId !== actorId)} onClick={() => void updateStatus(status)}>{statusLabel[status]}</button>)}</div>}
            {role === "seller" && selected.sellerId !== actorId && <p className="demo-inline-note">Cette demande appartient à un autre profil vendeur de la simulation.</p>}
            {selected.sellerId && <section className="demo-message-thread"><div className="demo-thread-heading"><MessageCircle size={16}/><h3>Conversation intégrée</h3><span>simulation</span></div><div className="demo-thread-messages">{selected.messages.length ? selected.messages.map((message) => <div className={`demo-thread-message ${message.senderId === actorId ? "mine" : ""}`} key={message.id}><b>{message.senderName}</b><p>{message.body}</p><small>{formatDate(message.createdAt)}</small></div>) : <p className="demo-empty-state">Pas encore de message. Commencez la conversation.</p>}</div>{(role === "buyer" || role === "seller") && <form className="demo-message-form" onSubmit={sendMessage}><input name="body" maxLength={1000} placeholder="Écrire un message fictif…" required disabled={selected.status === "closed" || (role === "seller" && selected.sellerId !== actorId)}/><button className="button button-primary" type="submit" aria-label="Envoyer" disabled={busy || selected.status === "closed" || (role === "seller" && selected.sellerId !== actorId)}><Send size={15}/></button></form>}</section>}
          </article> : role !== "buyer" && !loading && <div className="demo-empty-state demo-no-selection">Sélectionne une demande pour consulter ses détails.</div>}
        </div>
      </div>
    </section>
    <p className="demo-backend-footnote">Routes de test : <code>GET/POST /api/demo-backend/requests</code>, <code>PATCH /api/demo-backend/requests/:id</code>, <code>POST /api/demo-backend/requests/:id/messages</code>, <code>GET/PUT /api/demo-backend/storefront</code> et remise à zéro locale.</p>
  </main>;
}
