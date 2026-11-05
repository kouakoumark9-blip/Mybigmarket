import { Field } from "@/components/admin/page";

export type PageData = { id?: string; slug: string; title: string; excerpt: string | null; status: string; metaTitle: string | null; metaDescription: string | null; content: string; advanced: string };

export function PageForm({ page, action, submitLabel }: { page: PageData; action: (form: FormData) => Promise<void>; submitLabel: string }) {
  return <form action={action} className="grid gap-4 md:grid-cols-2">
    {page.id && <input type="hidden" name="pageId" value={page.id}/>}
    <Field label="Titre"><input name="title" defaultValue={page.title} required minLength={2} maxLength={190} className="ui-input"/></Field>
    <Field label="Adresse" hint="La page sera publiée sur /pages/adresse."><input name="slug" defaultValue={page.slug} required pattern="[a-z0-9-]+" maxLength={160} className="ui-input"/></Field>
    <Field label="Résumé" className="md:col-span-2"><input name="excerpt" defaultValue={page.excerpt ?? ""} maxLength={600} className="ui-input"/></Field>
    <Field label="Contenu" hint="« ## Titre » ou « ### Sous-titre » sur une ligne ; une ligne vide sépare les paragraphes. Aucun HTML." className="md:col-span-2"><textarea name="content" defaultValue={page.content} rows={14} className="ui-input !h-auto py-2 font-mono text-[13px]"/></Field>
    <Field label="Titre SEO"><input name="metaTitle" defaultValue={page.metaTitle ?? ""} maxLength={190} className="ui-input"/></Field>
    <Field label="Meta description"><input name="metaDescription" defaultValue={page.metaDescription ?? ""} maxLength={320} className="ui-input"/></Field>
    <details className="md:col-span-2"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Blocs avancés (images, FAQ, produits, formulaires…)</summary>
      <textarea name="advanced" defaultValue={page.advanced} rows={8} placeholder='[{"type":"faq","items":[{"question":"…","answer":"…"}]}]' className="ui-input mt-2 !h-auto py-2 font-mono text-xs"/>
    </details>
    <div className="flex flex-wrap items-center gap-4 md:col-span-2">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="status" value="draft" defaultChecked={page.status !== "published"}/> Brouillon</label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="radio" name="status" value="published" defaultChecked={page.status === "published"}/> Publiée</label>
      <button className="ui-button ui-button-primary ml-auto">{submitLabel}</button>
    </div>
  </form>;
}
