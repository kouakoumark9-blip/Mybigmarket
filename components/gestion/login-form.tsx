"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/gestion/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  return <form action={action} className="gs-form gs-card" autoComplete="on">
    {state.error && <div className="gs-msg gs-msg--err" role="alert">{state.error}</div>}
    <div className="gs-field"><label htmlFor="email">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete="username" required/></div>
    <div className="gs-field"><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" autoComplete="current-password" required/></div>
    <div className="gs-field"><label htmlFor="code">Code de vérification</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8}/><small>Seulement si la double authentification est activée sur votre compte.</small></div>
    <button className="gs-btn" type="submit" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</button>
  </form>;
}
