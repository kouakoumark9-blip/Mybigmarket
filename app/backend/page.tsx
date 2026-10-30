import { notFound, redirect } from "next/navigation";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const dynamic = "force-dynamic";
export default function BackendDemoAliasPage() {
  if (!isDemoBackendEnabled()) notFound();
  redirect("/demo-backend");
}
