import Link from "next/link";
import { logoutAction } from "@/app/gestion/actions";
import { requireAdmin } from "@/lib/gestion/session";

export default async function PanneauLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return <>
    <header className="gs-top"><nav className="gs-top-in" aria-label="Administration">
      <b>MyBigMarket</b>
      <Link href="/gestion">Tableau de bord</Link>
      <Link href="/gestion/produits">Produits</Link>
      <Link href="/gestion/commandes">Commandes</Link>
      <Link href="/gestion/categories">Catégories</Link>
      <Link href="/gestion/import">Import CSV</Link>
      <Link href="/" target="_blank">Voir la boutique</Link>
      <form action={logoutAction}><span style={{ fontSize: 13, marginRight: 8 }}>{admin.name || admin.email}</span><button className="gs-btn gs-btn--ghost" type="submit" style={{ minHeight: 32 }}>Se déconnecter</button></form>
    </nav></header>
    <div className="gs-main">{children}</div>
  </>;
}
