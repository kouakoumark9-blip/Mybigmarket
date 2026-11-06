"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/actions/auth";
import { useCountryPreferences } from "@/components/country-preferences";

export function AuthForm({ mode, callbackUrl = "/compte/commandes" }: { mode: "login" | "register"; callbackUrl?: string }) {
  const actionFn = mode === "login" ? loginAction : registerAction;
  const [state, action, pending] = useActionState(actionFn, {});
  const registering = mode === "register";
  const { tr } = useCountryPreferences();
  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/compte/commandes";
  const callbackQuery = `?callbackUrl=${encodeURIComponent(safeCallback)}`;
  return <main className="shell page-space"><div className="auth-card"><span className="eyebrow">{registering ? tr("REJOIGNEZ MYBIGMARKET") : tr("BON RETOUR")}</span><h1>{registering ? tr("Créer mon compte") : tr("Connexion")}</h1><p>{registering ? tr("Créez votre espace acheteur pour suivre vos précommandes et échanger avec les vendeurs.") : tr("Connectez-vous pour retrouver vos commandes et vos conversations.")}</p>
    <form action={action} className="auth-form"><input type="hidden" name="callbackUrl" value={safeCallback}/>{registering && <div className="field"><label htmlFor="name">{tr("Nom complet")}</label><input id="name" name="name" autoComplete="name" required minLength={2}/></div>}<div className="field"><label htmlFor="email">{tr("Adresse e-mail")}</label><input id="email" name="email" type="email" autoComplete="email" required/></div>{registering && <div className="field"><label htmlFor="phone">{tr("Téléphone")}</label><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+225 07..." required/></div>}<div className="field"><label htmlFor="password">{tr("Mot de passe")}</label><input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 10 : 8} required/></div>{state.error && <div className="form-error" role="alert">{state.error}</div>}<button className="button button-primary" disabled={pending}>{pending ? tr("Veuillez patienter…") : registering ? tr("Créer mon compte") : tr("Se connecter")}</button></form>
    <div className="auth-foot">{registering ? <>{tr("Vous avez déjà un compte ?")} <Link href={`/connexion${callbackQuery}`}>{tr("Se connecter")}</Link></> : <>{tr("Nouveau sur mybigmarket ?")} <Link href={`/inscription${callbackQuery}`}>{tr("Créer un compte")}</Link></>}</div>
  </div></main>;
}
