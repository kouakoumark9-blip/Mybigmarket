import { inArray } from "drizzle-orm";
import { PackageOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import { getAdminDb } from "@/lib/db";
import { adminOrders } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

type Shipment = { id: number; batchRef: string; status: string; statusLabel: string; nextStatuses: string[]; mode: string | null; carrierName: string | null; origin: string; destination: string; trackingNumber: string | null; expectedArrivalAt: string | null; departedAt: string | null; arrivedAt: string | null; orderCount?: number; createdAt: string };
const LABELS: Record<string, string> = { draft: "Brouillon", collecting: "Collecte", shipped: "Expédié", arrived_abidjan: "Arrivé à Abidjan", closed: "Clôturé", cancelled: "Annulé" };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("shipping.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Opérations", "Lots de groupage"]} title="Lots de groupage" subtitle="Regroupez les commandes d’un même envoi Chine → Abidjan ; chaque changement de statut du lot met à jour le suivi de ses commandes."/>;
  let data;
  try {
    const shipments = await adminApiList<Shipment>("/admin/shipments", { limit: 50, sort: "-createdAt" });
    const ready = await getAdminDb().select({ id: adminOrders.id, reference: adminOrders.reference }).from(adminOrders).where(inArray(adminOrders.status, ["seller_confirmed", "received_collection_point"])).limit(200);
    data = { shipments: shipments.data, ready };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="mb-5 grid gap-4">
      {data.shipments.length ? data.shipments.map((shipment) => <Card key={shipment.id} className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <b className="font-mono">{shipment.batchRef}</b><Badge tone={shipment.status === "shipped" ? "orange" : "neutral"}>{LABELS[shipment.status] ?? shipment.statusLabel}</Badge>
          <span className="text-sm text-slate-600">{shipment.mode === "air" ? "Avion" : shipment.mode === "sea" ? "Bateau" : "Mode à définir"} · {shipment.origin} → {shipment.destination}{shipment.carrierName ? ` · ${shipment.carrierName}` : ""}</span>
          <span className="ml-auto text-xs text-slate-500">{shipment.orderCount ?? 0} commande(s){shipment.expectedArrivalAt ? ` · arrivée prévue ${formatDate(shipment.expectedArrivalAt)}` : ""}</span>
        </div>
        <div className="flex flex-wrap gap-4">
          {shipment.nextStatuses.length > 0 && <form action={actions.shipmentStatusAction} className="flex gap-2"><input type="hidden" name="shipmentId" value={shipment.id}/><select name="status" className="ui-input h-9">{shipment.nextStatuses.map((next) => <option key={next} value={next}>{LABELS[next] ?? next}</option>)}</select><button className="ui-button ui-button-outline h-9">Changer le statut</button></form>}
          {["draft", "collecting"].includes(shipment.status) && <form action={actions.addOrdersAction} className="flex gap-2"><input type="hidden" name="shipmentId" value={shipment.id}/><select name="orderIds" className="ui-input h-9 max-w-xs"><option value="">Ajouter une commande prête…</option>{data.ready.map((order) => <option key={order.id} value={order.id}>{order.reference ?? order.id.slice(0, 8)}</option>)}</select><button className="ui-button ui-button-outline h-9">Ajouter</button></form>}
        </div>
      </Card>) : <Card><div className="admin-empty"><PackageOpen size={22} className="mb-2 text-slate-400"/><strong>Aucun lot</strong>Créez un lot pour regrouper les commandes d’un envoi.</div></Card>}
    </div>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouveau lot</h2>
      <form action={actions.createShipmentAction} className="grid gap-4 md:grid-cols-3">
        <Field label="Référence" hint="Vide : LOT-AAAAMMJJ-NN."><input name="batchRef" maxLength={64} className="ui-input"/></Field>
        <Field label="Mode"><select name="mode" className="ui-input"><option value="">À définir</option><option value="air">Avion</option><option value="sea">Bateau</option></select></Field>
        <Field label="Transporteur"><input name="carrierName" maxLength={120} className="ui-input"/></Field>
        <Field label="Origine"><input name="origin" defaultValue="Chine" className="ui-input"/></Field>
        <Field label="Destination"><input name="destination" defaultValue="Abidjan" className="ui-input"/></Field>
        <Field label="Arrivée prévue"><input name="expectedArrivalAt" type="date" className="ui-input"/></Field>
        <Field label="Numéro de suivi"><input name="trackingNumber" maxLength={120} className="ui-input"/></Field>
        <div className="flex items-end md:col-span-2"><button className="ui-button ui-button-primary">Créer le lot</button></div>
      </form>
    </Card>
  </>;
}
