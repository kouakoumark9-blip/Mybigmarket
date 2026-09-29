import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { sellerProfiles, users } from "@/lib/db/schema";

export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{pathname:string[]}>};

export async function GET(_request:Request,{params}:Context){
 const session=await auth();if(!session?.user?.id)return new Response("Unauthorized",{status:401});
 const {pathname:parts}=await params;const pathname=parts.join("/");
 if(!pathname.startsWith("seller-kyc/")||parts.length<3)return new Response("Not found",{status:404});
 const ownerId=parts[1];const db=getDb();
 const [current]=await db.select({role:users.role}).from(users).where(eq(users.id,session.user.id)).limit(1);
 if(!current)return new Response("Forbidden",{status:403});
 if(current.role!=="admin"&&session.user.id!==ownerId)return new Response("Forbidden",{status:403});
 const profiles=current.role==="admin"?await db.select().from(sellerProfiles):await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId,ownerId));
 const document=profiles.flatMap((profile)=>profile.documents||[]).find((file)=>file.pathname===pathname);
 if(!document)return new Response("Not found",{status:404});
 const token=process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;if(!token)return new Response("Private storage not configured",{status:503});
 const result=await get(pathname,{access:"private",token});if(!result||result.statusCode!==200)return new Response("Not found",{status:404});
 const filename=document.name.replace(/[\r\n"\\]/g,"-");
 return new Response(result.stream,{headers:{"Content-Type":document.contentType,"Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}
