import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PasswordChangeForm } from "./password-change-form";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const { session } = await requireEmployee("dashboard.read");

  return <>
    <div className="admin-breadcrumb"><span>Configuration</span><span>/</span><strong>Sécurité du compte</strong></div>
    <div className="admin-page-title-row">
      <div><h1 className="admin-page-title">Sécurité du compte</h1><p className="admin-page-subtitle">Modifie le mot de passe associé à {session.user.email}.</p></div>
    </div>
    <Card className="mx-auto max-w-2xl p-5 sm:p-7">
      <div className="mb-6 flex items-start gap-3 border-b border-slate-100 pb-5">
        <div className="rounded-xl bg-orange-50 p-3 text-orange-700"><LockKeyhole size={20}/></div>
        <div><h2 className="text-lg font-bold text-slate-950">Changer le mot de passe</h2><p className="mt-1 text-sm leading-6 text-slate-600">Confirme ton mot de passe actuel, puis choisis un nouveau mot de passe fort.</p></div>
      </div>
      <PasswordChangeForm />
      <div className="mt-6 flex gap-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-700"/><p>Le changement est journalisé et ferme les autres sessions. Le mot de passe est haché avant son stockage.</p></div>
    </Card>
  </>;
}
