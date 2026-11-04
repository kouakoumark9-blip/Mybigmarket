import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/server/core/auth/password";
import { isPermissionCode } from "@/server/core/permissions";

export const idParams = z.object({ id: z.string().uuid("Identifiant invalide.") });

const name = z.string().trim().min(1).max(100);
const email = z.string().trim().toLowerCase().email().max(190);
const password = z.string().min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères.`).max(PASSWORD_MAX_LENGTH);
const roleCode = z.string().regex(/^[a-z][a-z0-9_]{1,59}$/, "Code de rôle invalide.");
const permissionCode = z.string().refine(isPermissionCode, "Permission inconnue.");

export const createEmployeeBody = z.object({
  email, firstName: name, lastName: name, roleCode,
  /** Facultatif : sans mot de passe, un mot de passe temporaire est généré et doit être changé. */
  password: password.optional(),
}).strict();

export const updateEmployeeBody = z.object({
  firstName: name.optional(), lastName: name.optional(), roleCode: roleCode.optional(),
  status: z.enum(["active", "disabled"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

export const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH), newPassword: password }).strict();

export const createRoleBody = z.object({
  code: roleCode, name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).default(""),
  permissions: z.array(permissionCode).max(500).default([]),
}).strict();

export const updateRoleBody = z.object({
  name: z.string().trim().min(2).max(120).optional(), description: z.string().trim().max(500).optional(),
  permissions: z.array(permissionCode).max(500).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

export const createApiKeyBody = z.object({
  label: z.string().trim().min(2).max(120),
  scopes: z.array(permissionCode).min(1).max(200),
  expiresAt: z.coerce.date().optional(),
  allowedIps: z.array(z.string().regex(/^[0-9a-fA-F:.]{3,45}$/)).max(20).default([]),
}).strict();

export const loginBody = z.object({ email, password: z.string().min(1).max(PASSWORD_MAX_LENGTH), totpCode: z.string().regex(/^\d{6}$/).optional() }).strict();
export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) }).strict();

const employeeView = z.object({
  id: z.string().uuid(), email: z.string(), firstName: z.string(), lastName: z.string(), roleCode: z.string(), roleName: z.string(),
  status: z.string(), totpEnabled: z.boolean(), mustChangePassword: z.boolean(), lastLoginAt: z.string().nullable(), createdAt: z.string(),
});
export const employeeResponse = employeeView;
export const roleResponse = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), description: z.string().nullable(), isSystem: z.boolean(), permissions: z.array(z.string()), employeeCount: z.number() });
export const tokenResponse = z.object({ accessToken: z.string(), refreshToken: z.string(), tokenType: z.literal("Bearer"), expiresIn: z.number(), mustChangePassword: z.boolean(), employee: employeeView });
