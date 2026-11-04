import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Field, Notice, PageHeader } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import type { ProductListItem, Warehouse } from "@/lib/api-types";
import { warehouseOptions } from "@/lib/catalog-lookups";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

function ProductSelect({ products }: { products: ProductListItem[] }) {
  return <select name="target" required className="ui-input">{products.map((product) => <option key={product.id} value={product.id}>{product.title}{product.reference ? ` — ${product.reference}` : ""} (disp. {product.quantity})</option>)}</select>;
}

function WarehouseSelect({ name, warehouses, optional }: { name: string; warehouses: Warehouse[]; optional?: boolean }) {
  return <select name={name} required={!optional} className="ui-input">{optional && <option value="">Entrepôt par défaut</option>}{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isSellable ? "" : " (transit)"}</option>)}</select>;
}

export default async function StockOperationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("catalog.stock.update");
  const notice = await searchParams;
  const header = <PageHeader trail={["Catalogue", "Stock", "Opérations"]} title="Opérations de stock" subtitle="Transferts entre entrepôts, réceptions fournisseur, inventaires et import CSV. Chaque opération est tracée dans les mouvements." actions={<a href="/api/stock/export" className="ui-button ui-button-outline"><Download size={15}/> Exporter le stock (CSV)</a>}/>;
  let data;
  try {
    const [products, warehouses] = await Promise.all([adminApiList<ProductListItem>("/admin/products", { limit: 200, sort: "title", "filter[productType]": "standard" }), warehouseOptions()]);
    data = { products: products.data, warehouses };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { products, warehouses } = data;
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card id="reception" className="scroll-mt-20 p-5">
        <h2 className="mb-1 font-bold text-slate-950">Réception fournisseur</h2>
        <p className="mb-4 text-xs text-slate-500">Entrée de marchandise ; le coût unitaire met à jour le prix d’achat.</p>
        <form action={actions.receiptAction} className="grid gap-3">
          <Field label="Produit"><ProductSelect products={products}/></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Quantité reçue"><input name="quantity" type="number" min={1} required className="ui-input"/></Field><Field label="Coût unitaire HT"><input name="unitCostXof" type="number" min={0} className="ui-input"/></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Entrepôt"><WarehouseSelect name="warehouseId" warehouses={warehouses} optional/></Field><Field label="N° de bon de livraison"><input name="reference" required maxLength={120} className="ui-input"/></Field></div>
          <div><button className="ui-button ui-button-primary">Enregistrer la réception</button></div>
        </form>
      </Card>
      <Card id="transfert" className="scroll-mt-20 p-5">
        <h2 className="mb-1 font-bold text-slate-950">Transfert entre entrepôts</h2>
        <p className="mb-4 text-xs text-slate-500">Par exemple l’arrivée à Abidjan d’un stock en transit.</p>
        <form action={actions.transferAction} className="grid gap-3">
          <Field label="Produit"><ProductSelect products={products}/></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Depuis"><WarehouseSelect name="fromWarehouseId" warehouses={warehouses}/></Field><Field label="Vers"><WarehouseSelect name="toWarehouseId" warehouses={warehouses}/></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Quantité"><input name="quantity" type="number" min={1} required className="ui-input"/></Field><Field label="Note"><input name="note" maxLength={240} className="ui-input"/></Field></div>
          <div><button className="ui-button ui-button-primary">Transférer</button></div>
        </form>
      </Card>
      <Card id="inventaire" className="scroll-mt-20 p-5">
        <h2 className="mb-1 font-bold text-slate-950">Inventaire</h2>
        <p className="mb-4 text-xs text-slate-500">La quantité comptée remplace le stock physique ; l’écart est tracé.</p>
        <form action={actions.inventoryAction} className="grid gap-3">
          <Field label="Produit"><ProductSelect products={products}/></Field>
          <div className="grid grid-cols-3 gap-3"><Field label="Quantité comptée"><input name="quantity" type="number" min={0} required className="ui-input"/></Field><Field label="Entrepôt"><WarehouseSelect name="warehouseId" warehouses={warehouses} optional/></Field><Field label="Référence"><input name="reference" maxLength={120} placeholder="INV-2026-11" className="ui-input"/></Field></div>
          <div><button className="ui-button ui-button-primary">Enregistrer le comptage</button></div>
        </form>
      </Card>
      <Card id="import" className="scroll-mt-20 p-5">
        <h2 className="mb-1 font-bold text-slate-950">Import CSV</h2>
        <p className="mb-4 text-xs text-slate-500">Simulation exacte d’abord ; à l’application, la moindre ligne en erreur annule tout l’import.</p>
        <ImportForm/>
      </Card>
    </div>
  </>;
}
