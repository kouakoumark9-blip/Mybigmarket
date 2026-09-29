"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { MessageCircle, Send } from "lucide-react";
import { products } from "@/lib/demo-data";

type DemoMessage = { id: string; body: string; createdAt: string };
type DemoThread = { id: string; productSlug: string; messages: DemoMessage[] };
const storageKey = "mybigmarket-demo-messages-v1";
const serverSnapshot = "[]";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => { listeners.delete(callback); window.removeEventListener("storage", callback); };
}
function getSnapshot() { return localStorage.getItem(storageKey) || serverSnapshot; }
function getServerSnapshot() { return serverSnapshot; }
function saveThreads(threads: DemoThread[]) {
  localStorage.setItem(storageKey, JSON.stringify(threads));
  listeners.forEach((listener) => listener());
}
function parseThreads(snapshot: string): DemoThread[] {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed as DemoThread[] : [];
  } catch { return []; }
}

export function DemoMessenger({ initialSlug = "" }: { initialSlug?: string }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const threads = useMemo(() => parseThreads(snapshot), [snapshot]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const preferredThread = initialSlug ? threads.find((thread) => thread.productSlug === initialSlug) : undefined;
  const activeId = preferredThread?.id || selectedId || threads[0]?.id || "";
  const activeThread = threads.find((thread) => thread.id === activeId);
  const activeProduct = products.find((item) => item.slug === (activeThread?.productSlug || initialSlug));

  function startThread() {
    const product = products.find((item) => item.slug === initialSlug);
    if (!product) return;
    const existing = threads.find((thread) => thread.productSlug === product.slug);
    if (existing) { setSelectedId(existing.id); return; }
    const thread: DemoThread = { id: crypto.randomUUID(), productSlug: product.slug, messages: [] };
    saveThreads([thread, ...threads]);
    setSelectedId(thread.id);
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeThread) return;
    const newMessage: DemoMessage = { id: crypto.randomUUID(), body, createdAt: new Date().toISOString() };
    saveThreads(threads.map((thread) => thread.id === activeThread.id ? { ...thread, messages: [...thread.messages, newMessage] } : thread));
    setDraft("");
  }

  return <main className="shell page-space">
    <div className="breadcrumbs"><Link href="/">Accueil</Link><span>›</span><span>Messages</span></div>
    <div className="messages-heading"><div><span className="eyebrow">ÉCHANGES AVEC LES VENDEURS</span><h1 className="page-title">Ma messagerie</h1><p className="page-subtitle">Retrouvez ici vos conversations liées aux produits.</p></div><Link className="button button-outline" href="/produits">Parcourir les produits</Link></div>
    <div className="demo-message-notice"><b>Mode aperçu local</b><span>Les messages de cet aperçu restent dans le stockage de ce navigateur. Ils ne sont pas transmis aux vendeurs. Pour des échanges entre comptes, configurez Neon et les comptes acheteur/vendeur.</span></div>
    <div className="messages-layout">
      <aside className="messages-list"><h2>Conversations</h2>{threads.length === 0 && <p className="messages-empty-small">Aucune conversation. Ouvrez une fiche produit et choisissez « Écrire au vendeur ».</p>}{threads.map((thread) => {
        const product = products.find((item) => item.slug === thread.productSlug);
        if (!product) return null;
        const latest = thread.messages[thread.messages.length - 1];
        return <button className={`message-thread-link ${activeId === thread.id ? "active" : ""}`} key={thread.id} onClick={() => setSelectedId(thread.id)}><b>{product.seller}</b><span>{product.title}</span><small>{latest?.body || "Nouvelle conversation"}</small></button>;
      })}</aside>
      <section className="messages-chat" aria-label="Conversation">
        {!activeThread && activeProduct && initialSlug ? <div className="messages-blank"><MessageCircle size={30}/><b>Écrire à {activeProduct.seller}</b><span>Cette conversation de démonstration sera enregistrée uniquement sur cet appareil.</span><button className="button button-primary" type="button" onClick={startThread}>Ouvrir la conversation</button></div> : !activeThread || !activeProduct ? <div className="messages-blank"><MessageCircle size={30}/><b>Commencez un échange depuis une fiche produit</b><span>Choisissez un article et contactez le vendeur depuis sa page.</span><Link className="button button-primary" href="/produits">Voir le catalogue</Link></div> : <>
          <header className="messages-chat-head"><div><b>{activeProduct.seller}</b><span>{activeProduct.title}</span></div><Link href={`/produits/${activeProduct.slug}`}>Voir la fiche produit</Link></header>
          <div className="messages-bubbles">{activeThread.messages.length === 0 ? <p className="messages-first-hint">Vous pouvez préparer votre message à propos de ce produit. En aperçu, le vendeur ne le reçoit pas.</p> : activeThread.messages.map((message) => <div className="message-bubble buyer-bubble" key={message.id}><span>{message.body}</span><time>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(message.createdAt))} · aperçu local</time></div>)}</div>
          <form className="message-compose" onSubmit={submitMessage}><label htmlFor="demo-message">Votre message (enregistré sur cet appareil)</label><textarea id="demo-message" maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ex. Bonjour, pouvez-vous confirmer les coloris et le prix pour 20 unités ?" required/><div><small>{draft.length}/2 000 caractères</small><button className="button button-primary" disabled={!draft.trim()}><Send size={15}/> Enregistrer la note</button></div></form>
        </>}
      </section>
    </div>
  </main>;
}
