import { asc } from "drizzle-orm";
import { CategoryForm } from "@/components/gestion/category-form";
import { getDb } from "@/lib/db";
import { categories } from "@/lib/db/schema";

export default async function CategoriesPage() {
  const rows = await getDb().select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  const top = rows.filter((row) => row.sortOrder < 90);
  return <>
    <h1>Catégories : textes et référencement</h1>
    <p>Modifiez ici le titre, la description Google, l&apos;introduction, le texte explicatif et les questions fréquentes de chaque catégorie.</p>
    {top.map((row) => <CategoryForm key={row.id} values={{ id: row.id, name: row.name, slug: row.slug, introText: row.introText ?? "", bodyText: row.bodyText ?? "", metaTitle: row.metaTitle ?? "", metaDescription: row.metaDescription ?? "", faq: (row.faq ?? []).map((item) => `${item.question}\n${item.answer}`).join("\n\n") }}/>)}
  </>;
}
