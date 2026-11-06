import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { categories, productImages, products, sellerProfiles, sellerStorefronts, users } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { products as demoProducts, sellers as demoSellers, type DemoProduct } from "@/lib/demo-data";
import { getMockStorefrontForSeller, getMockStorefrontBySlug } from "@/lib/demo-backend";
import { smartphoneCamon50Pro } from "@/lib/product";

export type StoreSeller = { slug:string; name:string; university:string; city:string; rating:number; orders:number; initials:string };
export type PublicStorefront = { slug:string; storeName:string; headline:string; description:string; announcement:string|null; sellerSlug:string; sellerName:string; university:string; city:string; rating:number; productCount:number; isDemo:boolean };

export async function getPublicStorefrontBySlug(slug:string):Promise<PublicStorefront|undefined>{
  if(!process.env.DATABASE_URL){
    const mockStore=getMockStorefrontBySlug(slug);
    if(mockStore){
      if(!mockStore.isPublished)return undefined;
      const sellerSlug=mockStore.sellerId==="seller-aya"?"aya-t":"lina-k";
      return {slug:mockStore.slug,storeName:mockStore.storeName,headline:mockStore.headline,description:mockStore.description,announcement:mockStore.announcement,sellerSlug,sellerName:mockStore.sellerName,university:mockStore.university,city:mockStore.city,rating:mockStore.rating,productCount:demoProducts.filter((product)=>product.sellerSlug===sellerSlug).length,isDemo:true};
    }
    const seller=demoSellers.find((item)=>item.slug===slug);
    if(!seller)return undefined;
    const mockActorId=seller.slug==="lina-k"?"seller-lina":seller.slug==="aya-t"?"seller-aya":null;
    const currentMock=mockActorId?getMockStorefrontForSeller(mockActorId):null;
    if(currentMock&&(currentMock.slug!==slug||!currentMock.isPublished))return undefined;
    return {slug:seller.slug,storeName:seller.name,headline:"Une boutique partenaire mybigmarket",description:`Découvrez les produits proposés par ${seller.name}, vendeur partenaire en Chine. Profil et catalogue de démonstration.`,announcement:"Catalogue de démonstration · disponibilité à confirmer",sellerSlug:seller.slug,sellerName:seller.name,university:seller.university,city:seller.city,rating:seller.rating,productCount:demoProducts.filter((product)=>product.sellerSlug===seller.slug).length,isDemo:true};
  }
  const db=getDb();
  const [row]=await db.select({store:sellerStorefronts,user:users,profile:sellerProfiles}).from(sellerStorefronts)
    .innerJoin(users,eq(users.id,sellerStorefronts.sellerId)).innerJoin(sellerProfiles,eq(sellerProfiles.userId,users.id))
    .where(and(eq(sellerStorefronts.slug,slug),eq(sellerStorefronts.isPublished,true),eq(sellerProfiles.verificationStatus,"approved"),eq(users.status,"active"))).limit(1);
  if(!row)return undefined;
  const sellerSlug=row.user.email.split("@")[0];
  const productCount=await countCatalogProductsForSeller(sellerSlug);
  return {slug:row.store.slug,storeName:row.store.storeName,headline:row.store.headline,description:row.store.description,announcement:row.store.announcement,sellerSlug,sellerName:row.user.name,university:row.profile.university,city:row.profile.cityChina,rating:Number(row.profile.ratingAvg),productCount,isDemo:false};
}

export async function getStorefrontProducts(sellerSlug:string):Promise<DemoProduct[]>{
  return (await getCatalogProducts()).filter((product)=>product.sellerSlug===sellerSlug);
}

/**
 * Nombre de produits réellement publiés pour un vendeur.
 * Évite de dépendre du plafond de 100 lignes du catalogue général.
 */
export async function countCatalogProductsForSeller(sellerSlug:string):Promise<number>{
  if(!process.env.DATABASE_URL)return demoProducts.filter((product)=>product.sellerSlug===sellerSlug).length;
  const db=getDb();
  const [row]=await db.select({value:count()}).from(products)
    .innerJoin(users,eq(users.id,products.sellerId))
    .innerJoin(sellerProfiles,eq(sellerProfiles.userId,users.id))
    .where(and(eq(products.status,"approved"),eq(sellerProfiles.verificationStatus,"approved"),eq(users.status,"active"),sql`split_part(${users.email}, '@', 1) = ${sellerSlug}`));
  return Number(row?.value||0);
}

/**
 * Lit le catalogue public.
 *
 * Une panne de base ne doit pas faire tomber la vitrine. Si Neon est suspendu,
 * non migré ou mal configuré, on retombe sur le catalogue de démonstration
 * embarqué dans le bundle : le site reste consultable, et l'état réel de la
 * base reste lisible sur /api/health. L'erreur est journalisée, jamais avalée.
 *
 * `forceDemo` sert aux pages purement vitrines : elles se rendent alors sans
 * toucher la base, donc sans 500 possible ni latence inutile.
 */
export async function getCatalogProducts(options:{featured?:boolean;forceDemo?:boolean}={}) : Promise<DemoProduct[]> {
  // Sans base (développement local), le parcours de démonstration simule les commandes dans le navigateur.
  if (!process.env.DATABASE_URL) return demoCatalog(options);
  if (options.forceDemo) return markDemo(demoCatalog(options));
  try {
    const rows = await queryCatalog(options);
    // Vrais produits d'abord, complétés par les exemples de démonstration (marqués, non commandables)
    // pour que la vitrine ne paraisse pas vide tant que le catalogue réel est réduit.
    const realSlugs = new Set(rows.map((row) => row.slug));
    const examples = markDemo(demoCatalog(options).filter((product) => !realSlugs.has(product.slug)));
    return options.featured ? [...rows, ...examples].slice(0, 8) : [...rows, ...examples];
  } catch (error) {
    console.error("[catalog] Base injoignable, repli sur le catalogue de démonstration :", error instanceof Error ? error.message : error);
    return markDemo(demoCatalog(options));
  }
}

function markDemo(items:DemoProduct[]):DemoProduct[] {
  return items.map((product)=>({ ...product, isDemo:true }));
}

function demoCatalog(options:{featured?:boolean}={}):DemoProduct[] {
  if (!options.featured) return [smartphoneCamon50Pro, ...demoProducts];
  return [smartphoneCamon50Pro, ...demoProducts.filter((p)=>p.slug.includes("sac")||p.slug.includes("montre")||p.slug.includes("lunettes")||p.slug.includes("ecouteurs")||p.slug.includes("support")||p.slug.includes("lampe")||p.slug.includes("pinceaux"))].slice(0,8);
}

async function queryCatalog(options:{featured?:boolean}={}) : Promise<DemoProduct[]> {
  const db=getDb();
  const where=options.featured?and(eq(products.status,"approved"),eq(products.isFeatured,true),eq(sellerProfiles.verificationStatus,"approved"),eq(users.status,"active")):and(eq(products.status,"approved"),eq(sellerProfiles.verificationStatus,"approved"),eq(users.status,"active"));
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

/**
 * Vendeurs de la vitrine. Même filet que le catalogue : une base indisponible
 * ne doit pas faire tomber la page, on retombe sur les vendeurs de démonstration.
 */
export async function getStoreSellers():Promise<StoreSeller[]>{
  if(!process.env.DATABASE_URL)return demoSellers;
  try{
    const rows=await queryStoreSellers();
    // Aucun vendeur validé et actif en base : même règle que le catalogue.
    return rows.length?rows:demoSellers;
  }catch(error){
    console.error("[catalog] Base injoignable, repli sur les vendeurs de démonstration :", error instanceof Error ? error.message : error);
    return demoSellers;
  }
}

async function queryStoreSellers():Promise<StoreSeller[]>{
  const db=getDb();
  const rows=await db.select({user:users,profile:sellerProfiles}).from(sellerProfiles).innerJoin(users,eq(users.id,sellerProfiles.userId)).where(and(eq(sellerProfiles.verificationStatus,"approved"),eq(users.status,"active"))).orderBy(desc(sellerProfiles.ratingAvg)).limit(50);
  return rows.map(({user,profile})=>({slug:user.email.split("@")[0],name:user.name,university:profile.university,city:profile.cityChina,rating:Number(profile.ratingAvg),orders:profile.ratingCount,initials:user.name.split(/\s+/).map((part)=>part[0]).join("").slice(0,2).toUpperCase()}));
}
