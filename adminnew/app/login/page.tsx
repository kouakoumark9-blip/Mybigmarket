import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Boxes, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connexion employé", robots: { index: false, follow: false, noarchive: true, nosnippet: true } };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  return <main className="login-page">
    <section className="login-brand-panel" aria-label="mybigmarket administration">
      <div className="login-brand-logo"><span className="login-brand-symbol">M</span><span>mybigmarket <span className="font-normal text-cyan-200">admin</span></span></div>
      <div className="login-brand-copy"><h1>Administration<br/>de la boutique</h1><p>Gère le catalogue, les commandes et les opérations de mybigmarket depuis un espace réservé à l’équipe.</p></div>
      <div className="login-security-note"><ShieldCheck size={16}/> Authentification employé · sessions protégées</div>
    </section>
    <section className="login-form-panel">
      <div className="login-form-wrap">
        <p className="mb-3 text-xs font-bold uppercase tracking-[.12em] text-cyan-700">Espace professionnel</p>
        <h2>Connexion</h2>
        <p className="login-form-intro">Utilise les identifiants attribués à ton compte employé.</p>
        <LoginForm/>
        <div className="mt-7 flex items-center gap-2 border-t border-slate-100 pt-5 text-[11px] text-slate-500"><Boxes size={14}/> Console privée — aucune inscription publique.</div>
      </div>
    </section>
  </main>;
}
