import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import CheckoutForm from "@/components/checkout-form";
import { getDb } from "@/lib/db";
import { paymentCountryRules, paymentMethodConfigs, pickupPoints } from "@/lib/db/schema";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Finaliser ma commande"};

/** Moyens de paiement réellement ouverts, par pays : la page n'affiche que ceux-là. */
async function availablePayments(db:ReturnType<typeof getDb>):Promise<Record<string,string[]>|undefined>{
 try{
  const rows=await db.select({code:paymentMethodConfigs.code,country:paymentCountryRules.countryCode}).from(paymentMethodConfigs).innerJoin(paymentCountryRules,eq(paymentCountryRules.paymentMethodId,paymentMethodConfigs.id)).where(and(eq(paymentMethodConfigs.isActive,true),eq(paymentCountryRules.isAllowed,true)));
  const byCountry:Record<string,string[]>={};
  for(const row of rows)(byCountry[row.country]??=[]).push(row.code);
  return byCountry;
 }catch(error){
  console.error("[checkout] Moyens de paiement illisibles :",error instanceof Error?error.message:error);
  return undefined; // base ancienne : on garde la liste complète, le serveur tranche à la confirmation
 }
}

export default async function CheckoutPage(){
 if(!process.env.DATABASE_URL)return <CheckoutForm pickupPoints={[{id:1,name:"Point démo Plateau",city:"Abidjan",address:"Plateau, Abidjan"},{id:2,name:"Point démo Cocody",city:"Abidjan",address:"Cocody, Abidjan"}]} demoMode/>;
 const db=getDb();
 const [points,payments]=await Promise.all([db.select({id:pickupPoints.id,name:pickupPoints.name,city:pickupPoints.city,address:pickupPoints.address}).from(pickupPoints).where(eq(pickupPoints.isActive,true)),availablePayments(db)]);
 return <CheckoutForm pickupPoints={points} paymentsByCountry={payments}/>;
}
