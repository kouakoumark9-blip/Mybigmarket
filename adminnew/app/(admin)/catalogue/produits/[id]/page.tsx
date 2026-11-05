import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ApiUnavailable, Badge, Field, Notice, PageHeader, formatDate, formatXof } from "@/components/admin/page";
import { adminApi, apiErrorMessage } from "@/lib/admin-api";
import { PRODUCT_STATUS_LABELS, type AttributeGroup, type ProductDetail, type SimulatedPrice, type SpecificPrice } from "@/lib/api-types";
import { attributeGroupOptions, brandOptions, categoryOptions, customerGroupOptions, taxGroupOptions, warehouseOptions } from "@/lib/catalog-lookups";
import { requireEmployee } from "@/lib/permissions";
import * as actions from "./actions";
import { PhotoUploader } from "./photo-uploader";

export const dynamic = "force-dynamic";

const reductionLabel = (price: SpecificPrice) => price.reductionType === "percent" ? `−${price.reductionValue} %` : price.reductionType === "amount" ? `−${formatXof(price.reductionValue)}` : `Prix fixe ${formatXof(price.reductionValue)}`;

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return <Card id={id} className="scroll-mt-20 p-5">
    <div className="mb-4"><h2 className="text-base font-bold text-slate-950">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>
    {children}
  </Card>;
}

const Submit = ({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "outline" | "danger" }) => <button type="submit" className={`ui-button ui-button-${variant}`}>{children}</button>;

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireEmployee("catalog.products.read");
  const [{ id }, notice] = await Promise.all([params, searchParams]);
  let data;
  try {
    const [product, price, specificPrices, categories, brands, taxGroups, attributeGroups, warehouses, customerGroups] = await Promise.all([
      adminApi<ProductDetail>("GET", `/admin/products/${id}`),
      adminApi<SimulatedPrice>("GET", `/admin/products/${id}/price`, { query: { country: "CI" } }),
      adminApi<SpecificPrice[]>("GET", `/admin/products/${id}/specific-prices`),
      categoryOptions(), brandOptions(), taxGroupOptions(), attributeGroupOptions().catch(() => [] as AttributeGroup[]), warehouseOptions(), customerGroupOptions(),
    ]);
    data = { product, price, specificPrices, categories, brands, taxGroups, attributeGroups, warehouses, customerGroups };
  } catch (error) {
    return <><PageHeader trail={["Catalogue", "Produits", "Fiche"]} title="Fiche produit"/><Notice error={notice.error}/><ApiUnavailable message={apiErrorMessage(error)}/></>;
  }
  const { product, price, specificPrices, categories, brands, taxGroups, attributeGroups, warehouses, customerGroups } = data;
  const hidden = <><input type="hidden" name="productId" value={product.id}/><input type="hidden" name="version" value={product.version}/></>;
  const isPublic = product.status === "approved" || product.status === "published";
  const groupName = (groupId: number | null) => customerGroups.find((group) => group.id === groupId)?.name ?? "Tous les clients";
  const imageOrder = product.images.map((image) => image.id).join(",");
  const tierRows = [...product.priceTiers.filter((tier) => tier.variantId == null), ...Array.from({ length: 6 }, () => null)].slice(0, 6);

  return <>
    <PageHeader
      trail={["Catalogue", "Produits", product.title]}
      title={product.title}
      subtitle={`Réf. ${product.reference ?? "—"} · SKU ${product.sku ?? "—"} · modifié le ${formatDate(product.updatedAt)} · version ${product.version}`}
      actions={<>
        {isPublic && <a className="ui-button ui-button-outline" href={`https://mybigmarket.vercel.app/produits/${product.slug}`} target="_blank" rel="noreferrer">Voir en boutique <ExternalLink size={14}/></a>}
        <form action={actions.setStatusAction}>{hidden}<input type="hidden" name="status" value={isPublic ? "draft" : "approved"}/><Submit variant={isPublic ? "outline" : "primary"}>{isPublic ? "Retirer de la vente" : "Mettre en ligne"}</Submit></form>
        <form action={actions.duplicateAction}>{hidden}<Submit variant="outline">Dupliquer</Submit></form>
        <form action={actions.trashAction}>{hidden}<Submit variant="danger">Corbeille</Submit></form>
      </>}
    />
    <Notice ok={notice.ok} error={notice.error}/>
    <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
      <Badge tone={isPublic ? "orange" : "neutral"}>{PRODUCT_STATUS_LABELS[product.status] ?? product.status}</Badge>
      <Badge>{product.productType === "pack" ? "Pack" : product.productType === "virtual" ? "Virtuel" : "Produit simple"}</Badge>
      <Badge tone={product.stock.available <= product.lowStockThreshold ? "warning" : "neutral"}>Disponible : {product.stock.available}</Badge>
      {["general", "prix", "prix-specifiques", "paliers", "images", "declinaisons", "stock", "seo"].map((anchor) => <a key={anchor} href={`#${anchor}`} className="rounded-full border border-slate-200 px-2.5 py-1 font-semibold text-slate-600 hover:border-slate-400">{{ general: "Informations", prix: "Prix", "prix-specifiques": "Prix spécifiques", paliers: "Paliers", images: "Images", declinaisons: "Déclinaisons", stock: "Stock", seo: "SEO" }[anchor]}</a>)}
    </div>

    <div className="grid gap-5">
      <Section id="general" title="Informations générales">
        <form action={actions.updateGeneralAction} className="grid gap-4 md:grid-cols-3">
          {hidden}
          <Field label="Nom" className="md:col-span-2"><input name="title" defaultValue={product.title} required minLength={3} maxLength={190} className="ui-input"/></Field>
          <Field label="Slug (URL)" hint="Un changement crée une redirection 301."><input name="slug" defaultValue={product.slug} required className="ui-input"/></Field>
          <Field label="Catégorie principale"><select name="categoryId" defaultValue={product.categoryId} className="ui-input">{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field>
          <Field label="Marque"><select name="brandId" defaultValue={product.brandId ?? ""} className="ui-input"><option value="">Aucune</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Field>
          <Field label="État"><select name="condition" defaultValue={product.condition} className="ui-input"><option value="new">Neuf</option><option value="refurbished">Reconditionné</option><option value="used">Occasion</option></select></Field>
          <Field label="Référence"><input name="reference" defaultValue={product.reference ?? ""} maxLength={64} className="ui-input"/></Field>
          <Field label="SKU"><input name="sku" defaultValue={product.sku ?? ""} maxLength={80} className="ui-input"/></Field>
          <Field label="EAN13"><input name="ean13" defaultValue={product.ean13 ?? ""} maxLength={13} className="ui-input"/></Field>
          <Field label="Visibilité"><select name="visibility" defaultValue={product.visibility} className="ui-input"><option value="everywhere">Partout</option><option value="catalog">Catalogue seulement</option><option value="search">Recherche seulement</option><option value="nowhere">Nulle part</option></select></Field>
          <Field label="En rupture de stock"><select name="outOfStockBehavior" defaultValue={product.outOfStockBehavior} className="ui-input"><option value="use_default">Réglage de la boutique</option><option value="refuse">Refuser la commande</option><option value="backorder">Accepter la commande</option></select></Field>
          <Field label="Quantité minimale"><input name="minimumQuantity" type="number" min={1} defaultValue={product.minimumQuantity} className="ui-input"/></Field>
          <Field label="Seuil d’alerte de stock"><input name="lowStockThreshold" type="number" min={0} defaultValue={product.lowStockThreshold} className="ui-input"/></Field>
          <Field label="Délai d’approvisionnement (jours)"><input name="leadTimeDays" type="number" min={0} max={365} defaultValue={product.leadTimeDays} className="ui-input"/></Field>
          <Field label="MPN"><input name="mpn" defaultValue={product.mpn ?? ""} maxLength={40} className="ui-input"/></Field>
          <Field label="Poids (g)"><input name="weightGrams" type="number" min={0} defaultValue={product.weightGrams} className="ui-input"/></Field>
          <Field label="Dimensions L × l × h (mm)"><div className="flex gap-2"><input name="lengthMm" type="number" min={0} defaultValue={product.lengthMm} className="ui-input" aria-label="Longueur"/><input name="widthMm" type="number" min={0} defaultValue={product.widthMm} className="ui-input" aria-label="Largeur"/><input name="heightMm" type="number" min={0} defaultValue={product.heightMm} className="ui-input" aria-label="Hauteur"/></div></Field>
          <Field label="Étiquettes" hint="Séparées par des virgules." className="md:col-span-2"><input name="tags" defaultValue={product.tags.join(", ")} className="ui-input"/></Field>
          <Field label="Résumé" className="md:col-span-3"><input name="shortDescription" defaultValue={product.shortDescription ?? ""} maxLength={320} className="ui-input"/></Field>
          <Field label="Description" className="md:col-span-3"><textarea name="description" rows={7} defaultValue={product.description} className="ui-input !h-auto py-2"/></Field>
          <div className="flex flex-wrap gap-5 text-sm font-semibold text-slate-700 md:col-span-3">
            <label className="flex items-center gap-2"><input type="checkbox" name="availableForOrder" defaultChecked={product.availableForOrder}/> Disponible à la commande</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="showPrice" defaultChecked={product.showPrice}/> Afficher le prix</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={product.isFeatured}/> Mis en avant</label>
          </div>
          <div className="md:col-span-3"><Submit>Enregistrer les informations</Submit></div>
        </form>
      </Section>

      <Section id="prix" title="Prix" description="Prix saisis hors taxes. Le prix payé tient compte des paliers, des remises de groupe, des prix spécifiques et des règles de prix, sans jamais descendre sous le prix d’achat.">
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Prix client (CI) TTC</div><div className="text-lg font-bold text-slate-950">{formatXof(price.unitPriceInclTaxXof)}</div>{price.hasDiscount && <div className="text-xs text-slate-500 line-through">{formatXof(price.regularPriceInclTaxXof)}</div>}</div>
          <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Prix client HT</div><div className="text-lg font-bold text-slate-950">{formatXof(price.unitPriceExclTaxXof)}</div><div className="text-xs text-slate-500">Taxe {price.taxRatePercent} %</div></div>
          <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Marge</div><div className="text-lg font-bold text-slate-950">{formatXof(price.marginXof)}</div><div className="text-xs text-slate-500">{price.marginPercent == null ? "Prix d’achat non renseigné" : `${price.marginPercent} %`}</div></div>
          <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Remise appliquée</div><div className="text-lg font-bold text-slate-950">{price.hasDiscount ? `−${price.discountPercent} %` : "Aucune"}</div><div className="text-xs text-slate-500">{price.appliedRule ? (price.appliedRule.source === "catalog_rule" ? "Règle de prix" : "Prix spécifique") : price.floorApplied ? "Plancher au prix d’achat" : "Prix catalogue"}</div></div>
        </div>
        <form action={actions.updatePricesAction} className="grid gap-4 md:grid-cols-4">
          {hidden}
          <Field label="Prix de vente HT"><input name="priceXof" type="number" min={0} defaultValue={product.priceXof} required className="ui-input"/></Field>
          <Field label="Prix d’achat HT"><input name="purchasePriceXof" type="number" min={0} defaultValue={product.purchasePriceXof ?? ""} className="ui-input"/></Field>
          <Field label="Écotaxe"><input name="ecotaxXof" type="number" min={0} defaultValue={product.ecotaxXof} className="ui-input"/></Field>
          <Field label="Taxe"><select name="taxRuleGroupId" defaultValue={product.taxRuleGroupId ?? ""} className="ui-input"><option value="">Aucune taxe</option>{taxGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
          <div className="md:col-span-4"><Submit>Enregistrer les prix</Submit></div>
        </form>
      </Section>

      <Section id="prix-specifiques" title="Prix spécifiques" description="Prix fixe ou remise réservés à un groupe de clients, un pays, une quantité minimale ou une période. Le client obtient toujours la règle la plus favorable.">
        {specificPrices.length ? <div className="admin-table-wrap mb-4"><table className="admin-table min-w-[760px]"><thead><tr><th>Remise</th><th>Pour</th><th>À partir de</th><th>Période</th><th></th></tr></thead><tbody>{specificPrices.map((entry) => <tr key={entry.id}>
          <td className="font-semibold text-slate-900">{reductionLabel(entry)}</td>
          <td>{groupName(entry.customerGroupId)}{entry.countryCode ? ` · ${entry.countryCode}` : ""}{entry.variantId ? ` · déclinaison ${product.combinations.find((combination) => combination.id === entry.variantId)?.value ?? entry.variantId}` : ""}</td>
          <td>{entry.fromQuantity} unité(s)</td>
          <td>{entry.dateFrom || entry.dateTo ? `${formatDate(entry.dateFrom)} → ${formatDate(entry.dateTo)}` : "Permanent"}</td>
          <td><form action={actions.deleteSpecificPriceAction}>{hidden}<input type="hidden" name="specificPriceId" value={entry.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form></td>
        </tr>)}</tbody></table></div> : <p className="mb-4 text-sm text-slate-500">Aucun prix spécifique.</p>}
        <form action={actions.addSpecificPriceAction} className="grid gap-3 md:grid-cols-4">
          {hidden}
          <Field label="Type"><select name="reductionType" className="ui-input"><option value="percent">Remise en %</option><option value="amount">Remise en FCFA</option><option value="fixed_price">Prix fixe HT</option></select></Field>
          <Field label="Valeur"><input name="reductionValue" required inputMode="decimal" className="ui-input"/></Field>
          <Field label="Groupe de clients"><select name="customerGroupId" className="ui-input"><option value="">Tous les clients</option>{customerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
          <Field label="À partir de (unités)"><input name="fromQuantity" type="number" min={1} defaultValue={1} className="ui-input"/></Field>
          <Field label="Déclinaison"><select name="variantId" className="ui-input"><option value="">Toutes</option>{product.combinations.map((combination) => <option key={combination.id} value={combination.id}>{combination.value}</option>)}</select></Field>
          <Field label="Pays (code ISO)"><input name="countryCode" maxLength={2} placeholder="CI" className="ui-input"/></Field>
          <Field label="Du"><input name="dateFrom" type="date" className="ui-input"/></Field>
          <Field label="Au"><input name="dateTo" type="date" className="ui-input"/></Field>
          <div className="md:col-span-4"><Submit variant="outline">Ajouter le prix spécifique</Submit></div>
        </form>
      </Section>

      <Section id="paliers" title="Prix dégressifs" description="Prix unitaire HT par tranche de quantité. Un palier remplace le prix de base et ne se cumule pas avec lui. Laissez une ligne vide pour la supprimer.">
        <form action={actions.setTiersAction} className="grid gap-2">
          {hidden}
          <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-slate-500"><span>À partir de</span><span>Jusqu’à (facultatif)</span><span>Prix unitaire HT</span></div>
          {tierRows.map((tier, index) => <div key={index} className="grid grid-cols-3 gap-2">
            <input name={`min${index}`} type="number" min={1} defaultValue={tier?.minimumQuantity ?? ""} className="ui-input" aria-label={`Palier ${index + 1} : quantité minimale`}/>
            <input name={`max${index}`} type="number" min={1} defaultValue={tier?.maximumQuantity ?? ""} className="ui-input" aria-label={`Palier ${index + 1} : quantité maximale`}/>
            <input name={`price${index}`} type="number" min={0} defaultValue={tier?.unitPriceXof ?? ""} className="ui-input" aria-label={`Palier ${index + 1} : prix`}/>
          </div>)}
          <div><Submit variant="outline">Enregistrer les paliers</Submit></div>
        </form>
      </Section>

      <Section id="images" title="Images" description="Ajoutez les photos depuis l’ordinateur ou le téléphone. La couverture apparaît dans les listes et en tête de la fiche.">
        <PhotoUploader productId={product.id} hasImages={product.images.length > 0}/>
        {product.images.length ? <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{product.images.map((image, index) => <div key={image.id} className="overflow-hidden rounded-lg border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt ?? ""} className="aspect-square w-full bg-slate-50 object-contain"/>
          <div className="flex items-center gap-1 border-t border-slate-100 p-2">
            {image.isCover ? <Badge tone="orange">Couverture</Badge> : <form action={actions.setCoverAction}>{hidden}<input type="hidden" name="imageId" value={image.id}/><button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Définir comme couverture" title="Définir comme couverture"><Star size={15}/></button></form>}
            <span className="ml-auto"/>
            {index > 0 && <form action={actions.moveImageAction}>{hidden}<input type="hidden" name="imageId" value={image.id}/><input type="hidden" name="order" value={imageOrder}/><input type="hidden" name="direction" value="up"/><button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Monter"><ArrowUp size={15}/></button></form>}
            {index < product.images.length - 1 && <form action={actions.moveImageAction}>{hidden}<input type="hidden" name="imageId" value={image.id}/><input type="hidden" name="order" value={imageOrder}/><input type="hidden" name="direction" value="down"/><button className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Descendre"><ArrowDown size={15}/></button></form>}
            <form action={actions.deleteImageAction}>{hidden}<input type="hidden" name="imageId" value={image.id}/><button className="rounded p-1.5 text-red-700 hover:bg-red-50" aria-label="Supprimer l’image"><Trash2 size={15}/></button></form>
          </div>
        </div>)}</div> : <p className="mb-4 text-sm text-slate-500">Aucune image.</p>}
        <details className="mt-2 rounded-lg border border-slate-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Ajouter une image par son adresse (URL)</summary>
        <form action={actions.addImageAction} className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto_auto] md:items-end">
          {hidden}
          <Field label="URL de l’image"><input name="url" type="url" required placeholder="https://…" className="ui-input"/></Field>
          <Field label="Texte alternatif"><input name="alt" maxLength={190} className="ui-input"/></Field>
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="isCover"/> Couverture</label>
          <button type="submit" className="ui-button ui-button-outline"><ImagePlus size={15}/> Ajouter</button>
        </form>
        </details>
      </Section>

      <Section id="declinaisons" title="Déclinaisons" description="Générées à partir des valeurs d’attributs choisies (toutes les combinaisons, 500 au maximum). Régénérer n’efface rien et ne crée pas de doublon.">
        {product.productType !== "standard" ? <p className="text-sm text-slate-500">Les packs et produits virtuels n’ont pas de déclinaisons.</p> : <>
          {product.combinations.length ? <div className="admin-table-wrap mb-5"><table className="admin-table min-w-[900px]"><thead><tr><th>Déclinaison</th><th>SKU</th><th>Impact prix HT</th><th>Seuil</th><th>Stock</th><th>Active</th><th>Par défaut</th><th></th></tr></thead><tbody>{product.combinations.map((combination) => <tr key={combination.id}>
            <td className="font-semibold text-slate-900">{combination.value}</td>
            <td colSpan={6}>
              <form action={actions.updateCombinationAction} className="grid grid-cols-[1fr_1fr_90px_90px_70px_90px_auto] items-center gap-2">
                {hidden}<input type="hidden" name="variantId" value={combination.id}/>
                <input name="sku" defaultValue={combination.sku ?? ""} className="ui-input !h-9" aria-label="SKU"/>
                <input name="priceDeltaXof" type="number" defaultValue={combination.priceDeltaXof} className="ui-input !h-9" aria-label="Impact sur le prix"/>
                <input name="lowStockThreshold" type="number" min={0} defaultValue={combination.lowStockThreshold} className="ui-input !h-9" aria-label="Seuil d’alerte"/>
                <span className="text-sm font-semibold">{combination.quantity}</span>
                <input type="checkbox" name="isActive" defaultChecked={combination.isActive} aria-label="Active"/>
                <input type="checkbox" name="isDefault" defaultChecked={combination.isDefault} aria-label="Par défaut"/>
                <button className="text-xs font-semibold text-slate-900 hover:underline">Enregistrer</button>
              </form>
            </td>
            <td><form action={actions.deleteCombinationAction}>{hidden}<input type="hidden" name="variantId" value={combination.id}/><button className="text-xs font-semibold text-red-700 hover:underline">Supprimer</button></form></td>
          </tr>)}</tbody></table></div> : <p className="mb-4 text-sm text-slate-500">Aucune déclinaison.</p>}
          {attributeGroups.length ? <form action={actions.generateCombinationsAction} className="grid gap-4">
            {hidden}
            <div className="grid gap-4 md:grid-cols-3">{attributeGroups.filter((group) => group.isActive).map((group) => <fieldset key={group.id} className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-sm font-bold text-slate-800">{group.name}</legend><div className="grid gap-1.5">{group.values.filter((value) => value.isActive).map((value) => <label key={value.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="attributeValueIds" value={value.id}/>{value.colorHex && <span className="inline-block size-3.5 rounded-full border border-slate-300" style={{ background: value.colorHex }}/>}{value.name}</label>)}</div></fieldset>)}</div>
            <div className="flex flex-wrap items-end gap-3"><Field label="Impact prix HT des nouvelles déclinaisons"><input name="priceImpactXof" type="number" defaultValue={0} className="ui-input !w-48"/></Field><Submit variant="outline">Générer les déclinaisons</Submit></div>
          </form> : <p className="text-sm text-slate-500">Créez d’abord des groupes d’attributs dans <Link href="/catalogue/attributs" className="font-semibold text-slate-900 underline">Attributs</Link>.</p>}
        </>}
      </Section>

      <Section id="stock" title="Stock" description="Disponible = physique − réservé (commandes en attente d’expédition). Seuls les entrepôts actifs et vendables comptent pour la boutique.">
        {product.productType === "pack" ? <p className="mb-4 text-sm text-slate-700">Disponible du pack : <strong>{product.pack?.available ?? 0}</strong> (son composant le plus rare).</p> : null}
        {product.stock.warehouses.length ? <div className="admin-table-wrap mb-4"><table className="admin-table min-w-[620px]"><thead><tr><th>Entrepôt</th><th>Physique</th><th>Réservé</th><th>Disponible</th><th>Vendable</th></tr></thead><tbody>{product.stock.warehouses.map((row) => <tr key={row.warehouseId}><td className="font-semibold text-slate-900">{row.name}</td><td>{row.physical}</td><td>{row.reserved}</td><td className="font-bold">{row.available}</td><td>{row.counted ? <Badge tone="orange">Oui</Badge> : <Badge>Non</Badge>}</td></tr>)}</tbody></table></div> : <p className="mb-4 text-sm text-slate-500">Aucun niveau de stock enregistré.</p>}
        {product.productType !== "virtual" && product.productType !== "pack" && <form action={actions.adjustProductStockAction} className="grid gap-3 md:grid-cols-6 md:items-end">
          {hidden}
          <Field label="Sens"><select name="direction" className="ui-input"><option value="in">Entrée +</option><option value="out">Sortie −</option></select></Field>
          <Field label="Quantité"><input name="quantity" type="number" min={1} required className="ui-input"/></Field>
          <Field label="Motif"><select name="reason" className="ui-input"><option value="purchase">Achat / réception</option><option value="restock">Réassort</option><option value="return">Retour client</option><option value="adjustment">Correction</option><option value="loss">Perte / casse</option></select></Field>
          <Field label="Entrepôt"><select name="warehouseId" className="ui-input">{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.isDefault ? " (défaut)" : ""}</option>)}</select></Field>
          <Field label="Déclinaison"><select name="variantId" className="ui-input"><option value="">Produit</option>{product.combinations.map((combination) => <option key={combination.id} value={combination.id}>{combination.value}</option>)}</select></Field>
          <Field label="Note"><input name="note" maxLength={240} className="ui-input"/></Field>
          <div className="flex flex-wrap gap-3 md:col-span-6"><Submit variant="outline">Enregistrer le mouvement</Submit><Link href={`/catalogue/stock/mouvements?productId=${product.id}`} className="ui-button ui-button-ghost">Historique des mouvements</Link></div>
        </form>}
      </Section>

      <Section id="seo" title="Référencement et redirection" description="Un produit retiré de la vente peut rediriger ses visiteurs vers sa catégorie, un autre produit ou une URL.">
        <form action={actions.updateSeoAction} className="grid gap-4 md:grid-cols-2">
          {hidden}
          <Field label="Titre SEO" hint="70 caractères conseillés."><input name="seoTitle" defaultValue={product.seoTitle ?? ""} maxLength={190} className="ui-input"/></Field>
          <Field label="Chemin canonique" hint="Ex. /produits/mon-produit"><input name="canonicalPath" defaultValue={product.canonicalPath ?? ""} className="ui-input"/></Field>
          <Field label="Description SEO" className="md:col-span-2"><input name="seoDescription" defaultValue={product.seoDescription ?? ""} maxLength={320} className="ui-input"/></Field>
          <Field label="Redirection si retiré de la vente"><select name="redirectType" defaultValue={product.redirectType ?? ""} className="ui-input"><option value="">Aucune (page introuvable)</option><option value="301">Permanente (301)</option><option value="302">Temporaire (302)</option></select></Field>
          <Field label="Vers"><div className="flex gap-2"><select name="redirectTargetType" defaultValue={product.redirectTargetType ?? "category"} className="ui-input !w-40"><option value="category">Catégorie</option><option value="product">Produit (slug)</option><option value="url">URL</option></select><input name="redirectTarget" defaultValue={product.redirectTarget ?? ""} placeholder="Vide = sa catégorie" className="ui-input"/></div></Field>
          <div className="md:col-span-2"><Submit>Enregistrer le référencement</Submit></div>
        </form>
      </Section>
    </div>
  </>;
}
