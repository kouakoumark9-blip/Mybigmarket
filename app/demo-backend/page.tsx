import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoBackendWorkbench } from "@/components/demo-backend-workbench";
import { isDemoBackendEnabled } from "@/lib/demo-backend-access";

export const metadata: Metadata = { title: "Simulation du backend" };
export const dynamic = "force-dynamic";
export default function DemoBackendPage() {
  if (!isDemoBackendEnabled()) notFound();
  return <DemoBackendWorkbench/>;
}
