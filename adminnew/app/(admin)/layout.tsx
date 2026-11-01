import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requireEmployee } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { session } = await requireEmployee();
  return <AdminShell user={{ name: session.user.name || session.user.email || "Employé", email: session.user.email || "", roleCode: session.user.roleCode, permissions: session.user.permissions }}>{children}</AdminShell>;
}
