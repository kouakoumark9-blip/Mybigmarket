"use client";

import { useState, useTransition } from "react";
import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { archiveProductAction } from "@/actions/seller";

export function ArchiveProductButton({productId}:{productId:string}){
 const [pending,startTransition]=useTransition();const [message,setMessage]=useState("");const router=useRouter();
 return <button className="table-action" disabled={pending} title="Archiver" onClick={()=>startTransition(async()=>{const result=await archiveProductAction(productId);setMessage(result.error||result.success||"");router.refresh();})}><Archive size={14}/><span>{pending?"…":"Archiver"}</span>{message&&<small className="sr-only">{message}</small>}</button>;
}
