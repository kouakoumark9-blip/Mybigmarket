import { asc, count, eq } from "drizzle-orm";
import { Boxes, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminDb } from "@/lib/db";
import { adminBrands, adminCategories } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/permissions";
import { createBrandAction, createCategoryAction, setBrandActiveAction, setCategoryActiveAction } from "./actions";

export const dynamic = "force-dynamic";

const noticeText: Record<string, string> = {
  "category-created": "Catégorie créée.",
  "category-updated": "Statut de la catégorie mis à jour.",
  "category-exists": "Ce nom ou ce slug de catégorie existe déjà.",
  "category-invalid": "Vérifie le nom, le slug et l’ordre de tri.",
  "category-error": "La catégorie n’a pas pu être enregistrée. Réessaie.",
  "brand-created": "Marque créée.",
  "brand-updated": "Statut de la marque mis à jour.",
  "brand-exists": "Ce nom ou ce slug de marque existe déjà.",
  "brand-invalid": "Vérifie le nom et le slug de la marque.",
  "brand-error": "La marque n’a pas pu être enregistrée. Réessaie.",
};

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireEmployee("catalog.categories.manage");
  await requireEmployee("catalog.brands.manage");
  const params = await searchParams;
  const notice = params.notice ? noticeText[params.notice] : undefined;
  const db = getAdminDb();
  const [categories, brands, activeCategories, activeBrands] = await Promise.all([
    db.select().from(adminCategories).orderBy(asc(adminCategories.sortOrder), asc(adminCategories.name)),
    db.select().from(adminBrands).orderBy(asc(adminBrands.name)),
    db.select({ value: count() }).from(adminCategories).where(eq(adminCategories.isActive, true)),
    db.select({ value: count() }).from(adminBrands).where(eq(adminBrands.isActive, true)),
  ]);

  return <>
    <div className="admin-breadcrumb"><span>Catalogue</span><span>/</span><strong>Catégories et marques</strong></div>
    <div className="admin-page-title-row"><div><h1 className="admin-page-title">Catégories et marques</h1><p className="admin-page-subtitle">Organise le catalogue de la boutique et active les entrées utilisées par les produits.</p></div></div>
    {notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800" role="status">{notice}</p>}

    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="rounded-lg bg-orange-50 p-2.5 text-orange-700"><Boxes size={19}/></div><div><h2 className="font-bold text-slate-950">Catégories</h2><p className="text-xs text-slate-500">{Number(activeCategories[0]?.value || 0)} active(s) sur {categories.length}</p></div></div></div>
        <form action={createCategoryAction} className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom<input name="name" required minLength={2} maxLength={100} className="ui-input" placeholder="Ex. Électronique"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Slug (facultatif)<input name="slug" maxLength={120} className="ui-input" placeholder="généré depuis le nom"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700 sm:col-span-2">Description<textarea name="description" maxLength={500} rows={2} className="ui-input min-h-20 resize-y" placeholder="Description interne ou éditoriale"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Ordre d’affichage<input name="sortOrder" type="number" min={0} max={9999} defaultValue={0} className="ui-input"/></label>
          <div className="flex items-end"><button className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto" type="submit">Ajouter la catégorie</button></div>
        </form>
        {categories.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[620px]"><thead><tr><th>Catégorie</th><th>Ordre</th><th>Statut</th><th></th></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td><div className="font-semibold text-slate-900">{category.name}</div><div className="text-[11px] text-slate-500">/{category.slug}</div></td><td>{category.sortOrder}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${category.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{category.isActive ? "Active" : "Inactive"}</span></td><td><form action={setCategoryActiveAction}><input type="hidden" name="id" value={category.id}/><input type="hidden" name="isActive" value={String(!category.isActive)}/><button className="text-xs font-semibold text-orange-700 hover:underline" type="submit">{category.isActive ? "Désactiver" : "Activer"}</button></form></td></tr>)}</tbody></table></div> : <div className="admin-empty"><strong>Aucune catégorie</strong>Ajoute une catégorie pour structurer le catalogue.</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="rounded-lg bg-slate-100 p-2.5 text-slate-700"><Tag size={19}/></div><div><h2 className="font-bold text-slate-950">Marques</h2><p className="text-xs text-slate-500">{Number(activeBrands[0]?.value || 0)} active(s) sur {brands.length}</p></div></div></div>
        <form action={createBrandAction} className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-5 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Nom<input name="name" required minLength={2} maxLength={100} className="ui-input" placeholder="Ex. Marque partenaire"/></label>
          <label className="grid gap-1 text-xs font-semibold text-slate-700">Slug (facultatif)<input name="slug" maxLength={120} className="ui-input" placeholder="généré depuis le nom"/></label>
          <div className="sm:col-span-2"><button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">Ajouter la marque</button></div>
        </form>
        {brands.length ? <div className="admin-table-wrap"><table className="admin-table min-w-[520px]"><thead><tr><th>Marque</th><th>Statut</th><th></th></tr></thead><tbody>{brands.map((brand) => <tr key={brand.id}><td><div className="font-semibold text-slate-900">{brand.name}</div><div className="text-[11px] text-slate-500">/{brand.slug}</div></td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${brand.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{brand.isActive ? "Active" : "Inactive"}</span></td><td><form action={setBrandActiveAction}><input type="hidden" name="id" value={brand.id}/><input type="hidden" name="isActive" value={String(!brand.isActive)}/><button className="text-xs font-semibold text-orange-700 hover:underline" type="submit">{brand.isActive ? "Désactiver" : "Activer"}</button></form></td></tr>)}</tbody></table></div> : <div className="admin-empty"><strong>Aucune marque</strong>Ajoute une marque à utiliser dans le catalogue.</div>}
      </Card>
    </div>
    <p className="mt-4 text-xs text-slate-500">Les créations et changements de statut sont enregistrés dans le journal d’audit. Une catégorie inactive reste rattachée aux produits existants.</p>
  </>;
}
