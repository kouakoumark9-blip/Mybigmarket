import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/db";
import { adminOrders, adminUsers, employeeAuditLogs, employees, permissions, rolePermissions } from "@/lib/db/schema";
import { effectiveEmployeeStatus } from "@/lib/employee-status";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;
const querySchema = z.object({
  status: z.string().trim().max(48).regex(/^[a-z_]*$/, "Statut invalide.").optional(),
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début invalide (AAAA-MM-JJ).").optional(),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide (AAAA-MM-JJ).").optional(),
});

/**
 * Neutralise l'injection de formule dans un tableur (CSV injection).
 * Une cellule commençant par = + - @ (ou tab/CR) est exécutée par Excel/LibreOffice ;
 * on la préfixe d'une apostrophe après normalisation des espaces.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\r\n|\r|\n/g, " ").trim();
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

function parseDay(value: string, endOfDay: boolean): Date | undefined {
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(request: Request) {
  const session = await auth();
  const employeeId = session?.user?.id;
  if (!employeeId) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });

  const db = getAdminDb();
  const [employee] = await db
    .select({ id: employees.id, roleId: employees.roleId, status: employees.status, lockedUntil: employees.lockedUntil, passwordChangedAt: employees.passwordChangedAt })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  // Le statut et la version de mot de passe sont revérifiés en base : une session révoquée ne peut pas exporter.
  if (!employee || effectiveEmployeeStatus(employee.status, employee.lockedUntil) !== "active" || session.user.passwordChangedAt !== employee.passwordChangedAt.toISOString()) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }
  const [allowed] = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(rolePermissions.roleId, employee.roleId), eq(permissions.code, "orders.export")))
    .limit(1);
  if (!allowed) return NextResponse.json({ error: "Permission d’export refusée." }, { status: 403 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Filtres invalides." }, { status: 400 });
  const from = parsed.data.from ? parseDay(parsed.data.from, false) : undefined;
  const to = parsed.data.to ? parseDay(parsed.data.to, true) : undefined;
  if (parsed.data.from && !from) return NextResponse.json({ error: "Date de début invalide." }, { status: 400 });
  if (parsed.data.to && !to) return NextResponse.json({ error: "Date de fin invalide." }, { status: 400 });
  if (from && to && from > to) return NextResponse.json({ error: "La date de début doit précéder la date de fin." }, { status: 400 });

  const filters: SQL[] = [];
  if (parsed.data.status) filters.push(eq(adminOrders.status, parsed.data.status));
  if (from) filters.push(gte(adminOrders.createdAt, from));
  if (to) filters.push(lte(adminOrders.createdAt, to));
  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: adminOrders.id,
      status: adminOrders.status,
      totalXof: adminOrders.totalXof,
      createdAt: adminOrders.createdAt,
      customerName: adminUsers.name,
      customerEmail: adminUsers.email,
    })
    .from(adminOrders)
    .leftJoin(adminUsers, eq(adminOrders.buyerId, adminUsers.id))
    .where(where)
    .orderBy(desc(adminOrders.createdAt))
    .limit(MAX_ROWS);

  const lines = [
    csvRow(["reference", "date", "client", "email", "statut", "total_xof"]),
    ...rows.map((row) =>
      csvRow([
        row.id.slice(0, 8).toUpperCase(),
        row.createdAt.toISOString(),
        row.customerName || "",
        row.customerEmail || "",
        row.status,
        row.totalXof,
      ]),
    ),
  ];

  // Journal d'audit : un export de données clients est une action sensible.
  await db.insert(employeeAuditLogs).values({
    actorEmployeeId: employeeId,
    action: "orders.exported",
    entityType: "order",
    entityId: null,
    details: {
      format: "csv",
      rows: rows.length,
      truncated: rows.length >= MAX_ROWS,
      filters: { status: parsed.data.status ?? null, from: parsed.data.from ?? null, to: parsed.data.to ?? null },
    },
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45) ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM UTF-8 : garantit les accents corrects dans Excel.
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${stamp}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
