import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import CheckoutForm from "@/components/checkout-form";
import { getDb } from "@/lib/db";
import { pickupPoints } from "@/lib/db/schema";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Finaliser ma commande"};
export default async function CheckoutPage(){
 if(!process.env.DATABASE_URL)return <CheckoutForm pickupPoints={[{id:1,name:"Point démo Plateau",city:"Abidjan",address:"Plateau, Abidjan"},{id:2,name:"Point démo Cocody",city:"Abidjan",address:"Cocody, Abidjan"}]} demoMode/>;
 const db=getDb();const points=await db.select({id:pickupPoints.id,name:pickupPoints.name,city:pickupPoints.city,address:pickupPoints.address}).from(pickupPoints).where(eq(pickupPoints.isActive,true));
 return <CheckoutForm pickupPoints={points}/>;
}
