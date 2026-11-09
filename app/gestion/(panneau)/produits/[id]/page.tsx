import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { deleteProductAction } from "@/app/gestion/actions";
import { ProductForm } from "@/components/gestion/product-form";
import { categoryOptions, productFormValues } from "@/lib/gestion/queries";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cree?: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [values, categories, query] = await Promise.all([productFormValues(id), categoryOptions(), searchParams]);
  if (!values) notFound();
  return <>
    <h1>{values.title}</h1>
    {query.cree && <div className="gs-msg gs-msg--ok">Produit créé.</div>}
    <p><Link href="/gestion/produits">← Retour aux produits</Link> · <Link href={`/produits/${values.slug}`} target="_blank">Voir la page publique</Link></p>
    <ProductForm values={values} categories={categories}/>
    <form action={deleteProductAction} className="gs-card" style={{ marginTop: 16 }}>
      <h2>Supprimer ce produit</h2>
      <p>Le produit disparaît de la boutique. Les commandes déjà passées gardent son nom et son prix.</p>
      <input type="hidden" name="id" value={values.id}/>
      <button type="submit" className="gs-btn gs-btn--danger">Supprimer définitivement</button>
    </form>
  </>;
}
