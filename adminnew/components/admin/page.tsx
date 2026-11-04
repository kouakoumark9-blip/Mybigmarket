import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";

/** En-tête de page : fil d'Ariane, titre, sous-titre et actions. */
export function PageHeader({ trail, title, subtitle, actions }: { trail: string[]; title: string; subtitle?: string; actions?: ReactNode }) {
  return <>
    <div className="admin-breadcrumb">{trail.map((part, index) => <span key={part} className="contents">{index > 0 && <span>/</span>}{index === trail.length - 1 ? <strong>{part}</strong> : <span>{part}</span>}</span>)}</div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">{title}</h1>{subtitle && <p className="admin-page-subtitle">{subtitle}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>
  </>;
}

/** Message de retour après une action (`?ok=…` ou `?error=…`). */
export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert"><CircleAlert size={16} className="mt-0.5 shrink-0"/>{error}</p>;
  if (ok) return <p className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-900" role="status"><CircleCheck size={16} className="mt-0.5 shrink-0"/>{ok}</p>;
  return null;
}

/** L'API ne répond pas ou n'est pas configurée : explication et marche à suivre. */
export function ApiUnavailable({ message }: { message: string }) {
  return <Card className="flex items-start gap-3 border-amber-200 bg-amber-50 p-5">
    <PlugZap size={20} className="mt-0.5 shrink-0 text-amber-800"/>
    <div className="text-sm leading-6 text-amber-950">
      <p className="font-semibold">Cet écran utilise l&apos;API du catalogue, qui n&apos;est pas disponible.</p>
      <p>{message}</p>
      <p className="mt-2 text-xs text-amber-900">À vérifier : la base de production est migrée (<code>migrate-all.sql</code>) et <code>ADMIN_API_JWT_SECRET</code> a la même valeur sur les projets Vercel « mybigmarket » et « mybigmarket-adminnew ».</p>
    </div>
  </Card>;
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 text-sm ${className}`}><span className="font-semibold text-slate-700">{label}</span>{children}{hint && <span className="text-xs text-slate-500">{hint}</span>}</label>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "orange" | "warning" | "danger" | "dark"; children: ReactNode }) {
  const classes = { neutral: "bg-slate-100 text-slate-700", orange: "bg-orange-50 text-orange-800", warning: "bg-amber-50 text-amber-800", danger: "bg-red-50 text-red-800", dark: "bg-slate-900 text-white" }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}>{children}</span>;
}

export const formatXof = (amount: number | null | undefined) => (amount == null ? "—" : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} FCFA`);
export const formatDate = (value: string | null | undefined) => (value ? new Intl.DateTimeFormat("fr-CI", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—");
