import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
}, (t) => [uniqueIndex("admin_roles_code_unique").on(t.code)]);

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 120 }).notNull(),
  label: varchar("label", { length: 140 }).notNull(),
  resource: varchar("resource", { length: 60 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
}, (t) => [uniqueIndex("admin_permissions_code_unique").on(t.code)]);

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => [index("admin_role_permissions_role_idx").on(t.roleId), index("admin_role_permissions_permission_idx").on(t.permissionId)]);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "restrict" }),
  email: varchar("email", { length: 190 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("admin_employees_email_unique").on(t.email), index("admin_employees_status_idx").on(t.status)]);

export const employeeSecurityEvents = pgTable("employee_security_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("employee_security_events_employee_time_idx").on(t.employeeId, t.createdAt)]);

export const employeeLoginEvents = pgTable("employee_login_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  emailAttempted: varchar("email_attempted", { length: 190 }).notNull(),
  succeeded: boolean("succeeded").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  failureReason: varchar("failure_reason", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("admin_login_email_time_idx").on(t.emailAttempted, t.createdAt), index("admin_login_ip_time_idx").on(t.ipAddress, t.createdAt)]);

export const adminProducts = pgTable("products", {
  id: uuid("id").primaryKey(),
  status: varchar("status", { length: 32 }).notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminOrders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  buyerId: uuid("buyer_id").notNull(),
  status: varchar("status", { length: 48 }).notNull(),
  totalXof: integer("total_xof").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminUsers = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  role: varchar("role", { length: 24 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
