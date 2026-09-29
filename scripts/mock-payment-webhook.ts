import { loadEnvConfig } from "@next/env";
import { createHmac } from "node:crypto";
loadEnvConfig(process.cwd());

async function main(){
 const [reference,amountArg,targetArg]=process.argv.slice(2);
 if(!reference||!amountArg)throw new Error("Usage: npm run payment:mock-webhook -- <payment-reference> <amount-xof> [base-url]");
 const amountXof=Number(amountArg);if(!Number.isSafeInteger(amountXof)||amountXof<1)throw new Error("amount-xof doit être un entier FCFA positif.");
 const target=targetArg||"http://localhost:3000";
 if(process.env.NODE_ENV==="production"&&!target.includes("localhost")&&!target.includes("127.0.0.1"))throw new Error("Le script mock refuse une cible distante en production.");
 const secret=process.env.MOCK_WEBHOOK_SECRET;if(!secret)throw new Error("MOCK_WEBHOOK_SECRET manquant.");
 const body=JSON.stringify({reference,status:"paid",amountXof,currency:"XOF"});
 const signature=createHmac("sha256",secret).update(body).digest("hex");
 const response=await fetch(`${target.replace(/\/$/,"")}/api/webhooks/payment`,{method:"POST",headers:{"content-type":"application/json","x-afm-signature":signature},body});
 console.log(response.status,await response.text());
 if(!response.ok)process.exitCode=1;
}
main().catch((error)=>{console.error(error);process.exit(1);});
