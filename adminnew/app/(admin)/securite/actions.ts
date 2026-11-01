"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/db";
import { employeeSecurityEvents, employees } from "@/lib/db/schema";

export type PasswordChangeState = {
  status: "idle" | "error" | "success";
  message: string;
};

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(16, "Le nouveau mot de passe doit contenir au moins 16 caractères.").max(200),
  confirmPassword: z.string().min(1).max(200),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Les deux nouveaux mots de passe ne correspondent pas.",
  path: ["confirmPassword"],
});

const error = (message: string): PasswordChangeState => ({ status: "error", message });

export async function changeEmployeePassword(_previousState: PasswordChangeState, formData: FormData): Promise<PasswordChangeState> {
  const session = await auth();
  const employeeId = session?.user?.id;
  if (!employeeId || !session.user.passwordChangedAt) return error("Ta session a expiré. Reconnecte-toi avant de modifier ton mot de passe.");

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return error(parsed.error.issues[0]?.message || "Vérifie les champs saisis.");
  if (parsed.data.currentPassword === parsed.data.newPassword) return error("Le nouveau mot de passe doit être différent de l’actuel.");

  try {
    const db = getAdminDb();
    const [employee] = await db.select({
      id: employees.id,
      email: employees.email,
      passwordHash: employees.passwordHash,
      passwordChangedAt: employees.passwordChangedAt,
      status: employees.status,
    }).from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!employee || employee.status !== "active" || employee.passwordChangedAt.toISOString() !== session.user.passwordChangedAt) {
      return error("Ta session n’est plus valide. Reconnecte-toi puis réessaie.");
    }
    if (!(await bcrypt.compare(parsed.data.currentPassword, employee.passwordHash))) {
      return error("Le mot de passe actuel est incorrect.");
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const requestHeaders = await headers();
    const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 45)
      || requestHeaders.get("x-real-ip")?.slice(0, 45)
      || null;
    const userAgent = requestHeaders.get("user-agent")?.slice(0, 500) || null;
    let changed = false;

    await db.transaction(async (tx) => {
      const [updated] = await tx.update(employees).set({
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      }).where(and(
        eq(employees.id, employee.id),
        eq(employees.status, "active"),
        eq(employees.passwordHash, employee.passwordHash),
        eq(employees.passwordChangedAt, employee.passwordChangedAt),
      )).returning({ id: employees.id });

      if (!updated) return;
      await tx.insert(employeeSecurityEvents).values({
        employeeId: employee.id,
        eventType: "password_changed",
        ipAddress,
        userAgent,
      });
      changed = true;
    });

    if (!changed) return error("Le mot de passe a changé dans une autre session. Reconnecte-toi puis réessaie.");
    return { status: "success", message: "Mot de passe modifié. Déconnexion en cours…" };
  } catch {
    return error("Le service de sécurité est momentanément indisponible. Réessaie plus tard.");
  }
}
