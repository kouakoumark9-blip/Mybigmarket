import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requireEmployee } from "@/lib/permissions";

export const metadata = { title: "Accès refusé", robots: { index: false, follow: false } };

export default async function ForbiddenPage() {
  await requireEmployee();
  return <section className="mx-auto mt-16 max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-700"><ShieldX size={22}/></div><h1 className="mt-4 text-xl font-bold">Accès refusé</h1><p className="mt-2 text-sm leading-6 text-slate-600">Ton profil employé ne dispose pas de l’autorisation nécessaire pour consulter cette page.</p><Link className="mt-5 inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white" href="/">Retour au tableau de bord</Link></section>;
}
