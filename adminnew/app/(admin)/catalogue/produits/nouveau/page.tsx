import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Field, Notice, PageHeader } from "@/components/admin/page";
import { apiErrorMessage } from "@/lib/admin-api";
import { brandOptions, categoryOptions, sellerOptions, taxGroupOptions } from "@/lib/catalog-lookups";
import { requireEmployee } from "@/lib/permissions";
import { createProductAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireEmployee("catalog.products.create");
  const params = await searchParams;
  let lookups;
  try {
    const [categories, brands, taxGroups, sellers] = await Promise.all([categoryOptions(), brandOptions(), taxGroupOptions(), sellerOptions()]);
    lookups = { categories, brands, taxGroups, sellers };
  } catch (error) {
    return <><PageHeader trail={["Catalogue", "Produits", "Nouveau"]} title="Nouveau produit"/><ApiUnavailable message={apiErrorMessage(error)}/></>;
  }

  return <>
    <PageHeader trail={["Catalogue", "Produits", "Nouveau"]} title="Nouveau produit" subtitle="Les prix sont saisis hors taxes, en FCFA. Le stock initial entre dans l’entrepôt par défaut et reste tracé." actions={<Link href="/catalogue/produits" className="ui-button ui-button-outline">Retour à la liste</Link>}/>
    <Notice error={params.error}/>
    <Card className="p-5">
      <form action={createProductAction} className="grid gap-4 md:grid-cols-2">
        <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
        <Field label="Nom du produit" className="md:col-span-2"><input name="title" required minLength={3} maxLength={190} className="ui-input"/></Field>
        <Field label="Vendeur"><select name="sellerId" required className="ui-input">{lookups.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name} ({seller.email})</option>)}</select></Field>
        <Field label="Catégorie principale"><select name="categoryId" required className="ui-input">{lookups.categories.map((category) => <option key={category.id} value={category.id}>{category.label}{category.isActive ? "" : " (inactive)"}</option>)}</select></Field>
        <Field label="Marque"><select name="brandId" className="ui-input"><option value="">Aucune</option>{lookups.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
        <Field label="Type"><select name="productType" className="ui-input"><option value="standard">Produit simple (déclinaisons possibles)</option><option value="pack">Pack</option><option value="virtual">Produit virtuel</option></select></Field>
        <Field label="Prix de vente HT (FCFA)"><input name="priceXof" type="number" min={0} required className="ui-input"/></Field>
        <Field label="Prix d’achat HT (FCFA)" hint="Plancher : le prix ne descend jamais en dessous."><input name="purchasePriceXof" type="number" min={0} className="ui-input"/></Field>
        <Field label="Taxe"><select name="taxRuleGroupId" className="ui-input"><option value="">Aucune taxe</option>{lookups.taxGroups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.rules.length ? ` — ${group.rules.map((rule) => `${rule.countryCode} ${rule.ratePercent} %`).join(", ")}` : ""}</option>)}</select></Field>
        <Field label="Quantité minimale de commande"><input name="minimumQuantity" type="number" min={1} defaultValue={1} className="ui-input"/></Field>
        <Field label="Référence"><input name="reference" maxLength={64} className="ui-input"/></Field>
        <Field label="SKU"><input name="sku" maxLength={80} className="ui-input"/></Field>
        <Field label="Stock initial" hint="Facultatif. Entre dans l’entrepôt par défaut."><input name="initialQuantity" type="number" min={0} className="ui-input"/></Field>
        <Field label="Étiquettes" hint="Séparées par des virgules."><input name="tags" className="ui-input"/></Field>
        <Field label="Résumé" className="md:col-span-2"><input name="shortDescription" maxLength={320} className="ui-input"/></Field>
        <Field label="Description" className="md:col-span-2"><textarea name="description" rows={6} className="ui-input !h-auto py-2"/></Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2"><input type="checkbox" name="publish"/> Mettre en ligne immédiatement (permission de publication requise)</label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2"><button type="submit" className="ui-button ui-button-primary">Créer le produit</button><span className="text-xs text-slate-500">Vous ajouterez ensuite les photos sur la fiche du produit.</span></div>
      </form>
    </Card>
  </>;
}
