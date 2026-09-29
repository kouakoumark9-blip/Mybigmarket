"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { confirmDelivery } from "@/actions/admin";

export function ConfirmDeliveryButton({orderId}:{orderId:string}){const [pending,start]=useTransition();const [message,setMessage]=useState("");const router=useRouter();return <div className="confirm-delivery"><button className="button button-primary" disabled={pending} onClick={()=>start(async()=>{const result=await confirmDelivery(orderId);setMessage(result.error||result.success||"");router.refresh();})}><BadgeCheck size={15}/>{pending?"Confirmation…":"Confirmer la réception"}</button>{message&&<p className="form-success">{message}</p>}</div>}
