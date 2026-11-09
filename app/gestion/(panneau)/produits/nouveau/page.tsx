import { ProductForm, emptyProduct } from "@/components/gestion/product-form";
import { categoryOptions } from "@/lib/gestion/queries";

export default async function NewProductPage() {
  return <><h1>Nouveau produit</h1><ProductForm values={emptyProduct} categories={await categoryOptions()}/></>;
}
