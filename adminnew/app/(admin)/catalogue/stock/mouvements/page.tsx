import Link from "next/link";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { STOCK_REASON_LABELS, type StockMovement } from "@/lib/api-types";
import { warehouseOptions } from "@/lib/catalog-lookups";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Search = { page?: string; productId?: string; reason?: string; warehouseId?: string; error?: string };

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireEmployee("catalog.stock.read");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const header = <PageHeader trail={["Catalogue", "Stock", "Mouvements"]} title="Mouvements de stock" subtitle="Chaque variation du stock physique : quantité avant et après, motif, entrepôt, commande ou référence."/>;
  let data;
  try {
    const query: Record<string, string | number> = { page, limit: 50, sort: "-createdAt" };
    if (params.productId) query["filter[productId]"] = params.productId;
    if (params.reason) query["filter[reason]"] = params.reason;
    if (params.warehouseId) query["filter[warehouseId]"] = params.warehouseId;
    const [movements, warehouses] = await Promise.all([adminApiList<StockMovement>("/admin/stock/movements", query), warehouseOptions()]);
    data = { movements, warehouses };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { movements, warehouses } = data;
  const link = (target: number) => `?${new URLSearchParams({ ...(params.productId ? { productId: params.productId } : {}), ...(params.reason ? { reason: params.reason } : {}), ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}), page: String(target) })}`;
  return <>
    {header}
    <Notice error={params.error}/>
    <Card className="mb-5 p-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {params.productId && <input type="hidden" name="productId" value={params.productId}/>}
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Motif<select name="reason" defaultValue={params.reason ?? ""} className="ui-input min-w-48"><option value="">Tous</option>{Object.entries(STOCK_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">Entrepôt<select name="warehouseId" defaultValue={params.warehouseId ?? ""} className="ui-input min-w-48"><option value="">Tous</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <button className="ui-button ui-button-primary">Filtrer</button>
        {(params.productId || params.reason || params.warehouseId) && <Link href="/catalogue/stock/mouvements" className="ui-button ui-button-outline">Tout afficher</Link>}
      </form>
    </Card>
    <Card>
      {movements.data.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1000px]"><thead><tr><th>Date</th><th>Produit</th><th>Motif</th><th>Entrepôt</th><th>Variation</th><th>Avant → après</th><th>Référence / note</th></tr></thead><tbody>{movements.data.map((movement) => <tr key={movement.id}>
        <td className="whitespace-nowrap text-xs">{formatDate(movement.createdAt)}</td>
        <td><Link href={`/catalogue/produits/${movement.productId}#stock`} className="font-semibold text-slate-900 hover:underline">{movement.title}</Link>{movement.variantId ? <div className="text-[11px] text-slate-500">Déclinaison {movement.variantId}</div> : null}</td>
        <td>{STOCK_REASON_LABELS[movement.reason] ?? movement.reason}</td>
        <td>{movement.warehouseCode ?? "—"}</td>
        <td className={`font-bold ${movement.delta < 0 ? "text-red-700" : "text-slate-900"}`}>{movement.delta > 0 ? `+${movement.delta}` : movement.delta}</td>
        <td>{movement.before} → {movement.after}</td>
        <td className="max-w-72 text-xs text-slate-600">{[movement.reference, movement.note, movement.orderId ? `commande ${movement.orderId.slice(0, 8)}` : null].filter(Boolean).join(" · ") || "—"}</td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><History size={22} className="mb-2 text-slate-400"/><strong>Aucun mouvement</strong>Les entrées, sorties, ventes et inventaires apparaîtront ici.</div>}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        <span>{movements.meta.total} mouvement(s) · page {movements.meta.page} / {movements.meta.totalPages}</span>
        <span className="flex gap-2">{page > 1 && <Link href={link(page - 1)} className="ui-button ui-button-outline">Précédent</Link>}{page < movements.meta.totalPages && <Link href={link(page + 1)} className="ui-button ui-button-outline">Suivant</Link>}</span>
      </div>
    </Card>
  </>;
}
