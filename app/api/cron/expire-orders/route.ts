import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orderEvents, orderItems, orders, payments, products } from "@/lib/db/schema";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:"Unauthorized"},{status:401});
 const db=getDb();const expired=await db.select({id:orders.id}).from(orders).where(and(eq(orders.status,"awaiting_payment"),lt(orders.paymentExpiresAt,new Date()))).limit(100);
 let processed=0;
 for(const row of expired){
  const changed=await db.transaction(async(tx)=>{
   const [cancelled]=await tx.update(orders).set({status:"cancelled",updatedAt:new Date()}).where(and(eq(orders.id,row.id),eq(orders.status,"awaiting_payment"),lt(orders.paymentExpiresAt,new Date()))).returning({id:orders.id});
   if(!cancelled)return false;
   await tx.update(payments).set({status:"cancelled"}).where(and(eq(payments.orderId,row.id),eq(payments.status,"pending")));
   const lines=await tx.select().from(orderItems).where(eq(orderItems.orderId,row.id));
   for(const line of lines)await tx.update(products).set({quantity:sql`${products.quantity} + ${line.quantity}`,updatedAt:new Date()}).where(eq(products.id,line.productId));
   await tx.insert(orderEvents).values({orderId:row.id,status:"cancelled",note:"Délai de paiement expiré; stock remis en vente."});
   return true;
  });
  if(changed)processed++;
 }
 return Response.json({ok:true,processed});
}
