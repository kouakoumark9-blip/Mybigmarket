import Link from "next/link";
import { PackageCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, PageHeader, formatXof } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Alerts = {
  products: Array<{ productId: string; title: string; reference: string | null; available: number; threshold: number; restockDate: string | null; outOfStock: boolean }>;
  variants: Array<{ productId: string; title: string; variantId: number; variant: string; sku: string | null; available: number; threshold: number; outOfStock: boolean }>;
};
type Replenishment = { periodDays: number; lines: number; suppliers: Array<{ supplierId: string | null; supplierName: string | null; estimatedCostXof: number; lines: Array<{ productId: string; title: string; reference: string | null; available: number; soldLastPeriod: number; dailySales: number; leadTimeDays: number; targetStock: number; suggestedQuantity: number; estimatedCostXof: number | null }> }> };

export default async function StockAlertsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireEmployee("catalog.stock.read");
  const params = await searchParams;
  const days = [7, 30, 60, 90].includes(Number(params.days)) ? Number(params.days) : 30;
  const header = <PageHeader trail={["Catalogue", "Stock", "Alertes"]} title="Alertes et réapprovisionnement" subtitle="Produits sous leur seuil d’alerte, et quantités à commander pour couvrir le délai d’approvisionnement plus 7 jours de sécurité."/>;
  let data;
  try {
    const [alerts, replenishment] = await Promise.all([adminApi<Alerts>("GET", "/admin/stock/alerts"), adminApi<Replenishment>("GET", "/admin/stock/replenishment", { query: { days } })]);
    data = { alerts, replenishment };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { alerts, replenishment } = data;
  const lowCount = alerts.products.length + alerts.variants.length;
  return <>
    {header}
    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-amber-50 p-2.5 text-amber-700"><TriangleAlert size={19}/></div><div><div className="text-xs font-semibold text-slate-500">Sous le seuil</div><div className="text-xl font-bold text-slate-950">{lowCount}</div></div></Card>
      <Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-red-50 p-2.5 text-red-700"><TriangleAlert size={19}/></div><div><div className="text-xs font-semibold text-slate-500">En rupture</div><div className="text-xl font-bold text-slate-950">{alerts.products.filter((row) => row.outOfStock).length + alerts.variants.filter((row) => row.outOfStock).length}</div></div></Card>
      <Card className="flex items-center gap-3 p-4"><div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><PackageCheck size={19}/></div><div><div className="text-xs font-semibold text-slate-500">Lignes à commander</div><div className="text-xl font-bold text-slate-950">{replenishment.lines}</div></div></Card>
    </div>
    <Card className="mb-5">
      <div className="border-b border-slate-100 px-4 py-3 font-bold text-slate-950">Sous le seuil d’alerte</div>
      {lowCount ? <div className="admin-table-wrap"><table className="admin-table min-w-[760px]"><thead><tr><th>Produit</th><th>Disponible</th><th>Seuil</th><th>État</th></tr></thead><tbody>
        {alerts.products.map((row) => <tr key={row.productId}><td><Link href={`/catalogue/produits/${row.productId}#stock`} className="font-semibold text-slate-900 hover:underline">{row.title}</Link><div className="text-[11px] text-slate-500">{row.reference ?? ""}</div></td><td className="font-bold">{row.available}</td><td>{row.threshold}</td><td>{row.outOfStock ? <Badge tone="danger">Rupture</Badge> : <Badge tone="warning">Stock bas</Badge>}</td></tr>)}
        {alerts.variants.map((row) => <tr key={`${row.productId}-${row.variantId}`}><td><Link href={`/catalogue/produits/${row.productId}#declinaisons`} className="font-semibold text-slate-900 hover:underline">{row.title}</Link><div className="text-[11px] text-slate-500">{row.variant}{row.sku ? ` · ${row.sku}` : ""}</div></td><td className="font-bold">{row.available}</td><td>{row.threshold}</td><td>{row.outOfStock ? <Badge tone="danger">Rupture</Badge> : <Badge tone="warning">Stock bas</Badge>}</td></tr>)}
      </tbody></table></div> : <div className="admin-empty"><PackageCheck size={22} className="mb-2 text-slate-400"/><strong>Aucune alerte</strong>Tous les produits sont au-dessus de leur seuil.</div>}
    </Card>
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><span className="font-bold text-slate-950">Réapprovisionnement suggéré</span>
        <span className="flex gap-1.5 text-xs">{[7, 30, 60, 90].map((value) => <Link key={value} href={`?days=${value}`} className={`rounded-full border px-2.5 py-1 font-semibold ${value === days ? "border-slate-950 bg-slate-950 !text-white" : "border-slate-200 text-slate-600"}`}>{value} jours</Link>)}</span></div>
      {replenishment.suppliers.length ? replenishment.suppliers.map((supplier) => <div key={supplier.supplierId ?? "none"} className="border-b border-slate-100 last:border-0">
        <div className="flex items-center justify-between bg-slate-50 px-4 py-2 text-sm"><strong>{supplier.supplierName ?? "Sans fournisseur par défaut"}</strong><span className="text-xs text-slate-600">Coût estimé : {formatXof(supplier.estimatedCostXof)}</span></div>
        <div className="admin-table-wrap"><table className="admin-table min-w-[820px]"><thead><tr><th>Produit</th><th>Disponible</th><th>Ventes ({replenishment.periodDays} j)</th><th>Délai</th><th>Stock cible</th><th>À commander</th></tr></thead><tbody>{supplier.lines.map((line) => <tr key={line.productId}>
          <td><Link href={`/catalogue/produits/${line.productId}`} className="font-semibold text-slate-900 hover:underline">{line.title}</Link></td><td>{line.available}</td><td>{line.soldLastPeriod} ({line.dailySales}/j)</td><td>{line.leadTimeDays} j</td><td>{line.targetStock}</td><td className="font-bold text-orange-800">{line.suggestedQuantity}</td>
        </tr>)}</tbody></table></div>
      </div>) : <div className="admin-empty"><PackageCheck size={22} className="mb-2 text-slate-400"/><strong>Rien à commander</strong>Le stock couvre les ventes de la période et les délais.</div>}
    </Card>
  </>;
}
