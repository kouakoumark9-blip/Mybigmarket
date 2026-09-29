import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { categories, productImages, products, sellerProfiles, users } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { products as demoProducts, sellers as demoSellers, type DemoProduct } from "@/lib/demo-data";

export type StoreSeller = { slug:string; name:string; university:string; city:string; rating:number; orders:number; initials:string };

export async function getCatalogProducts(options:{featured?:boolean}={}) : Promise<DemoProduct[]> {
  if (!process.env.DATABASE_URL) return options.featured ? demoProducts.filter((p)=>p.slug.includes("sac")||p.slug.includes("montre")||p.slug.includes("lunettes")||p.slug.includes("ecouteurs")||p.slug.includes("support")||p.slug.includes("lampe")||p.slug.includes("pinceaux")).slice(0,8) : demoProducts;
  const db=getDb();
  const where=options.featured?and(eq(products.status,"approved"),eq(products.isFeatured,true),eq(sellerProfiles.verificationStatus,"approved")):and(eq(products.status,"approved"),eq(sellerProfiles.verificationStatus,"approved"));
  const rows=await db.select({product:products,category:categories,user:users,profile:sellerProfiles}).from(products).innerJoin(categories,eq(categories.id,products.categoryId)).innerJoin(users,eq(users.id,products.sellerId)).innerJoin(sellerProfiles,eq(sellerProfiles.userId,users.id)).where(where).orderBy(desc(products.createdAt)).limit(options.featured?8:100);
  if(!rows.length)return [];
  const ids=rows.map((row)=>row.product.id);
  const images=await db.select().from(productImages).where(inArray(productImages.productId,ids)).orderBy(productImages.sortOrder);
  const imageMap=new Map<string,string>();
  for(const image of images)if(!imageMap.has(image.productId))imageMap.set(image.productId,image.url);
  return rows.map(({product,category,user,profile})=>({
    slug:product.slug,title:product.title,description:product.description,priceXof:product.priceXof,minimumQuantity:product.minimumQuantity,leadTimeDays:product.leadTimeDays,
    category:category.name,categorySlug:category.slug,seller:user.name,sellerSlug:user.email.split("@")[0],university:profile.university,city:profile.cityChina,
    rating:Number(profile.ratingAvg),reviewCount:profile.ratingCount,icon:"📦",tone:"sand",quantity:product.quantity,imageUrl:imageMap.get(product.id),
  }));
}

export async function getCatalogProduct(slug:string):Promise<DemoProduct|undefined>{
  const rows=await getCatalogProducts();
  return rows.find((product)=>product.slug===slug);
}

export async function getStoreSellers():Promise<StoreSeller[]>{
  if(!process.env.DATABASE_URL)return demoSellers;
  const db=getDb();
  const rows=await db.select({user:users,profile:sellerProfiles}).from(sellerProfiles).innerJoin(users,eq(users.id,sellerProfiles.userId)).where(eq(sellerProfiles.verificationStatus,"approved")).orderBy(desc(sellerProfiles.ratingAvg)).limit(50);
  return rows.map(({user,profile})=>({slug:user.email.split("@")[0],name:user.name,university:profile.university,city:profile.cityChina,rating:Number(profile.ratingAvg),orders:profile.ratingCount,initials:user.name.split(/\s+/).map((part)=>part[0]).join("").slice(0,2).toUpperCase()}));
}
