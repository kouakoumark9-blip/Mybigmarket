import { randomUUID } from "node:crypto";
import { Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate, formatXof } from "@/components/admin/page";
import { adminApiList, apiErrorMessage } from "@/lib/admin-api";
import type { Voucher } from "@/lib/api-types";
import { categoryOptions, customerGroupOptions } from "@/lib/catalog-lookups";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";

export const dynamic = "force-dynamic";

const discountLabel = (voucher: Voucher) => [
  voucher.discountType === "percent" ? `−${voucher.discountValue} %` : voucher.discountType === "amount" ? `−${formatXof(voucher.discountValue)}` : null,
  voucher.freeShipping ? "Livraison offerte" : null,
].filter(Boolean).join(" + ");

export default async function VouchersPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("pricing.read");
  const notice = await searchParams;
  const header = <PageHeader trail={["Boutique", "Bons de réduction"]} title="Bons de réduction" subtitle="Codes saisis par le client au panier. Les montants s’appliquent aux prix TTC réellement payés."/>;
  let data;
  try {
    const [vouchers, categories, groups] = await Promise.all([adminApiList<Voucher>("/admin/vouchers", { limit: 100 }), categoryOptions(), customerGroupOptions()]);
    data = { vouchers: vouchers.data, categories, groups };
  } catch (error) {
    return <>{header}<ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const groupName = (id: number | null) => data.groups.find((group) => group.id === id)?.name;
  return <>
    {header}
    <Notice ok={notice.ok} error={notice.error}/>
    <Card className="mb-5">
      {data.vouchers.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[1000px]"><thead><tr><th>Code</th><th>Avantage</th><th>Conditions</th><th>Utilisations</th><th>Période</th><th>Statut</th><th></th></tr></thead><tbody>{data.vouchers.map((voucher) => <tr key={voucher.id}>
        <td><div className="font-mono font-bold text-slate-900">{voucher.code}</div>{voucher.name && <div className="text-[11px] text-slate-500">{voucher.name}</div>}</td>
        <td className="font-semibold">{discountLabel(voucher)}{voucher.maximumDiscountXof ? <div className="text-[11px] font-normal text-slate-500">plafond {formatXof(voucher.maximumDiscountXof)}</div> : null}</td>
        <td className="text-xs leading-5 text-slate-600">{[voucher.minimumSubtotalXof ? `dès ${formatXof(voucher.minimumSubtotalXof)}` : null, groupName(voucher.customerGroupId) ? `groupe ${groupName(voucher.customerGroupId)}` : null, voucher.categoryIds.length ? `${voucher.categoryIds.length} catégorie(s)` : null, voucher.excludeDiscountedProducts ? "hors produits remisés" : null, voucher.combinable ? "cumulable" : "non cumulable"].filter(Boolean).join(" · ")}</td>
        <td>{voucher.usageCount}{voucher.usageLimit ? ` / ${voucher.usageLimit}` : ""}{voucher.perCustomerLimit ? <div className="text-[11px] text-slate-500">{voucher.perCustomerLimit} par client</div> : null}</td>
        <td className="text-xs">{voucher.startsAt || voucher.endsAt ? `${formatDate(voucher.startsAt)} → ${formatDate(voucher.endsAt)}` : "Sans limite"}</td>
        <td>{voucher.isActive ? <Badge tone="orange">Actif</Badge> : <Badge>Inactif</Badge>}</td>
        <td><div className="flex gap-3">
          <form action={actions.toggleVoucherAction}><input type="hidden" name="voucherId" value={voucher.id}/><input type="hidden" name="isActive" value={String(voucher.isActive)}/><button className="text-xs font-semibold text-slate-800 hover:underline">{voucher.isActive ? "Désactiver" : "Activer"}</button></form>
          <form action={actions.deleteVoucherAction}><input type="hidden" name="voucherId" value={voucher.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form>
        </div></td>
      </tr>)}</tbody></table></div> : <div className="admin-empty"><Ticket size={22} className="mb-2 text-slate-400"/><strong>Aucun bon de réduction</strong>Créez votre premier code ci-dessous.</div>}
    </Card>
    <Card className="p-5">
      <h2 className="mb-4 font-bold text-slate-950">Nouveau bon de réduction</h2>
      <form action={actions.createVoucherAction} className="grid gap-4 md:grid-cols-3">
        <input type="hidden" name="idempotencyKey" value={randomUUID()}/>
        <Field label="Code" hint="Vide : code unique généré."><input name="code" maxLength={64} placeholder="BIENVENUE10" className="ui-input uppercase"/></Field>
        <Field label="Nom interne"><input name="name" maxLength={120} className="ui-input"/></Field>
        <Field label="Type de remise"><select name="discountType" className="ui-input"><option value="percent">Pourcentage</option><option value="amount">Montant (FCFA)</option><option value="none">Aucune (livraison offerte seulement)</option></select></Field>
        <Field label="Valeur"><input name="discountValue" type="number" min={0} className="ui-input"/></Field>
        <Field label="Plafond de remise (FCFA)"><input name="maximumDiscountXof" type="number" min={0} className="ui-input"/></Field>
        <Field label="Panier minimum TTC (FCFA)"><input name="minimumSubtotalXof" type="number" min={0} className="ui-input"/></Field>
        <Field label="Utilisations au total"><input name="usageLimit" type="number" min={1} placeholder="Illimité" className="ui-input"/></Field>
        <Field label="Utilisations par client"><input name="perCustomerLimit" type="number" min={1} placeholder="Illimité" className="ui-input"/></Field>
        <Field label="Réservé au groupe"><select name="customerGroupId" className="ui-input"><option value="">Tous les clients</option>{data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
        <Field label="Début"><input name="startsAt" type="date" className="ui-input"/></Field>
        <Field label="Fin"><input name="endsAt" type="date" className="ui-input"/></Field>
        <Field label="Limité aux catégories" hint="Ctrl/Cmd pour plusieurs. Aucune = tout le panier."><select name="categoryIds" multiple size={4} className="ui-input !h-auto">{data.categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field>
        <div className="flex flex-wrap gap-5 text-sm font-semibold text-slate-700 md:col-span-3">
          <label className="flex items-center gap-2"><input type="checkbox" name="freeShipping"/> Livraison offerte</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="combinable"/> Cumulable avec d’autres bons</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="excludeDiscountedProducts"/> Exclure les produits déjà remisés</label>
        </div>
        <div className="md:col-span-3"><button className="ui-button ui-button-primary">Créer le bon</button></div>
      </form>
    </Card>
  </>;
}
