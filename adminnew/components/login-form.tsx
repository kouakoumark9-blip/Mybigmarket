"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function safeCallbackUrl() {
  const raw = new URLSearchParams(window.location.search).get("callbackUrl");
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: String(form.get("email") || ""),
        password: String(form.get("password") || ""),
        totpCode: String(form.get("totpCode") || ""),
        redirect: false,
        callbackUrl: safeCallbackUrl(),
      });
      if (!result || result.error) {
        setError("Connexion impossible. Vérifie tes identifiants et réessaie.");
        setPending(false);
        return;
      }
      router.replace(safeCallbackUrl());
      router.refresh();
    } catch {
      setError("Le service de connexion est momentanément indisponible.");
      setPending(false);
    }
  }

  return <form className="login-fields" onSubmit={submit}>
    {error && <p className="login-error" role="alert">{error}</p>}
    <label className="login-field"><span className="ui-label">Adresse e-mail professionnelle</span><Input name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={190} /></label>
    <label className="login-field"><span className="ui-label">Mot de passe</span><Input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
    <label className="login-field"><span className="ui-label">Code TOTP <span className="font-normal text-slate-500">(si activé sur ton compte)</span></span><Input name="totpCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" maxLength={12} /></label>
    <Button className="login-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin"/> : <ArrowRight size={16}/>} {pending ? "Connexion…" : "Se connecter"}</Button>
    <p className="login-footnote"><LockKeyhole size={13} className="mr-1 inline-block"/> Accès réservé aux employés autorisés. Les tentatives de connexion sont journalisées.</p>
  </form>;
}
