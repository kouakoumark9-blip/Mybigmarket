"use client";

import { useActionState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeEmployeePassword, type PasswordChangeState } from "./actions";

const initialState: PasswordChangeState = { status: "idle", message: "" };

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(changeEmployeePassword, initialState);

  useEffect(() => {
    if (state.status === "success") {
      const timer = window.setTimeout(() => {
        void signOut({ callbackUrl: "/login" });
      }, 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [state.status]);

  return <form action={formAction} className="grid gap-5">
    {state.message && <p className={state.status === "error" ? "rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800" : "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      Mot de passe actuel
      <Input name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} />
    </label>
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      Nouveau mot de passe
      <Input name="newPassword" type="password" autoComplete="new-password" required minLength={16} maxLength={200} aria-describedby="password-help" />
      <span id="password-help" className="text-xs font-normal text-slate-500">16 caractères minimum. Choisis un mot de passe unique, que tu n’utilises pas ailleurs.</span>
    </label>
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      Confirmer le nouveau mot de passe
      <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={16} maxLength={200} />
    </label>
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
      <Button type="submit" disabled={pending || state.status === "success"}>
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
        {pending ? "Mise à jour…" : state.status === "success" ? "Mot de passe modifié" : "Mettre à jour le mot de passe"}
      </Button>
      <span className="text-xs text-slate-500">Toutes les autres sessions seront invalidées.</span>
    </div>
  </form>;
}
