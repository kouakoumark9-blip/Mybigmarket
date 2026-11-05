import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const EXPORTS = [
  ["products", "Produits", "Toutes les colonnes réimportables (prix, stock, SEO, catégories)."],
  ["categories", "Catégories", "Arbre des catégories (chemin parent › enfant)."],
  ["brands", "Marques", "Marques et leur statut."],
  ["customers", "Clients", "Comptes clients, groupes et montants dépensés."],
  ["orders", "Commandes", "Commandes avec totaux, statut et paiement."],
] as const;

export default async function ExportsPage() {
  await requireEmployee("catalog.export");
  return <>
    <PageHeader trail={["Outils", "Exports"]} title="Exports CSV" subtitle="Fichiers UTF-8 ouverts directement par Excel. Les exports catalogue se réimportent tels quels après modification."/>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{EXPORTS.map(([code, title, text]) => <Card key={code} className="flex flex-col p-5">
      <h2 className="font-bold text-slate-950">{title}</h2><p className="mt-1 flex-1 text-sm text-slate-600">{text}</p>
      <a href={`/outils/telecharger?chemin=/admin/exports/${code}.csv`} className="ui-button ui-button-outline mt-4 w-fit"><Download size={15}/> Télécharger</a>
    </Card>)}</div>
  </>;
}
