import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

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

export const employeeAuditLogs = pgTable("employee_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmployeeId: uuid("actor_employee_id").references(() => employees.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("employee_audit_actor_time_idx").on(t.actorEmployeeId, t.createdAt), index("employee_audit_entity_idx").on(t.entityType, t.entityId)]);

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
  sellerId: uuid("seller_id").notNull(),
  categoryId: integer("category_id").notNull(),
  sku: varchar("sku", { length: 80 }),
  title: varchar("title", { length: 190 }).notNull(),
  slug: varchar("slug", { length: 210 }).notNull(),
  priceXof: integer("price_xof").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  quantity: integer("quantity").notNull(),
  lowStockThreshold: integer("low_stock_threshold").notNull(),
  minimumQuantity: integer("minimum_quantity").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  isFeatured: boolean("is_featured").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  productType: varchar("product_type", { length: 24 }).notNull().default("standard"),
  reference: varchar("reference", { length: 64 }),
  ean13: varchar("ean13", { length: 13 }),
  upc: varchar("upc", { length: 12 }),
  visibility: varchar("visibility", { length: 24 }).notNull().default("everywhere"),
  availableForOrder: boolean("available_for_order").notNull().default(true),
  showPrice: boolean("show_price").notNull().default(true),
  ecotaxXof: integer("ecotax_xof").notNull().default(0),
  weightGrams: integer("weight_grams").notNull().default(0),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  version: integer("version").notNull().default(0),
});

export const adminInventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey(),
  productId: uuid("product_id").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  movementType: varchar("movement_type", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  employeeId: uuid("employee_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Mouvements de stock détaillés (étape 3) — before/after conservés pour l'audit. */
export const adminStockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull(),
  variantId: integer("variant_id"),
  reason: varchar("reason", { length: 24 }).notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  orderId: uuid("order_id"),
  employeeId: uuid("employee_id"),
  note: varchar("note", { length: 240 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminReviews = pgTable("reviews", {
  id: uuid("id").primaryKey(),
  productId: uuid("product_id").notNull(),
  buyerId: uuid("buyer_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  verifiedPurchase: boolean("verified_purchase").notNull(),
  isPublished: boolean("is_published").notNull(),
  moderatedByEmployeeId: uuid("moderated_by_employee_id"),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminCategories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const adminBrands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull(),
});

export const adminSuppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey(),
  companyName: varchar("company_name", { length: 190 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  city: varchar("city", { length: 120 }),
  profileStatus: varchar("profile_status", { length: 24 }).notNull(),
  isActive: boolean("is_active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminOrders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  buyerId: uuid("buyer_id").notNull(),
  status: varchar("status", { length: 48 }).notNull(),
  totalXof: integer("total_xof").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const adminEscrowEntries = pgTable("escrow_entries", {
  id: uuid("id").primaryKey(),
  orderId: uuid("order_id").notNull(),
  status: varchar("status", { length: 24 }).notNull(),
});

export const adminOrderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").primaryKey(),
  orderId: uuid("order_id").notNull(),
  fromStatus: varchar("from_status", { length: 48 }),
  toStatus: varchar("to_status", { length: 48 }).notNull(),
  employeeId: uuid("employee_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminInvoices = pgTable("invoices", {
  id: uuid("id").primaryKey(),
  orderId: uuid("order_id").notNull(),
  invoiceNumber: varchar("invoice_number", { length: 60 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  subtotalXof: integer("subtotal_xof").notNull(),
  shippingXof: integer("shipping_xof").notNull(),
  taxXof: integer("tax_xof").notNull(),
  totalXof: integer("total_xof").notNull(),
  pdfUrl: text("pdf_url"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminCreditNotes = pgTable("credit_notes", {
  id: uuid("id").primaryKey(),
  orderId: uuid("order_id").notNull(),
  invoiceId: uuid("invoice_id"),
  creditNoteNumber: varchar("credit_note_number", { length: 60 }).notNull(),
  amountXof: integer("amount_xof").notNull(),
  reason: text("reason").notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminShippingMethods = pgTable("shipping_methods", {
  id: uuid("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  mode: varchar("mode", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull(),
  sampleRatesOnly: boolean("sample_rates_only").notNull(),
  transitDaysMin: integer("transit_days_min").notNull(),
  transitDaysMax: integer("transit_days_max").notNull(),
  volumetricDivisor: integer("volumetric_divisor").notNull().default(6000),
  minimumBillableWeightKg: varchar("minimum_billable_weight_kg", { length: 30 }).notNull().default("0.5"),
  seaMinimumVolumeM3: varchar("sea_minimum_volume_m3", { length: 30 }).notNull().default("0.1"),
  minimumChargeXof: integer("minimum_charge_xof").notNull().default(0),
  insurancePercent: varchar("insurance_percent", { length: 10 }).notNull().default("0"),
  customsHandlingXof: integer("customs_handling_xof").notNull().default(0),
  fragileSurchargeXof: integer("fragile_surcharge_xof").notNull().default(0),
  billableBasis: varchar("billable_basis", { length: 12 }).notNull().default("both"),
  freeAboveXof: integer("free_above_xof").notNull().default(0),
  freeAboveWeightGrams: integer("free_above_weight_grams").notNull().default(0),
  outOfRangeBehavior: varchar("out_of_range_behavior", { length: 20 }).notNull().default("disable"),
  maxPackageWeightGrams: integer("max_package_weight_grams").notNull().default(30000),
  maxPackageLengthCm: integer("max_package_length_cm").notNull().default(150),
  deliveryTimeLabel: varchar("delivery_time_label", { length: 120 }).notNull().default(""),
  trackingUrlPattern: varchar("tracking_url_pattern", { length: 255 }).notNull().default(""),
  configurationNote: text("configuration_note").notNull().default(""),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminShippingZones = pgTable("shipping_zones", {
  id: uuid("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  countryCodes: jsonb("country_codes").$type<string[]>().notNull(),
  isActive: boolean("is_active").notNull(),
  regionCodes: jsonb("region_codes").$type<string[]>().notNull().default([]),
  cityNames: jsonb("city_names").$type<string[]>().notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes").notNull().default(""),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const adminShippingRates = pgTable("shipping_rates", {
  id: uuid("id").primaryKey(),
  shippingMethodId: uuid("shipping_method_id").notNull(),
  shippingZoneId: uuid("shipping_zone_id").notNull(),
  minimumBillableUnits: varchar("minimum_billable_units", { length: 30 }).notNull(),
  maximumBillableUnits: varchar("maximum_billable_units", { length: 30 }),
  rateXofPerUnit: integer("rate_xof_per_unit").notNull(),
  sampleOnly: boolean("sample_only").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  minimumChargeXof: integer("minimum_charge_xof").notNull().default(0),
  handlingFeeXof: integer("handling_fee_xof").notNull().default(0),
  customsFeeXof: integer("customs_fee_xof").notNull().default(0),
  label: varchar("label", { length: 120 }).notNull().default(""),
  transitDaysMin: integer("transit_days_min"),
  transitDaysMax: integer("transit_days_max"),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminShippingDiscountTiers = pgTable("shipping_discount_tiers", {
  id: uuid("id").primaryKey(),
  shippingMethodId: uuid("shipping_method_id").notNull(),
  shippingZoneId: uuid("shipping_zone_id"),
  minimumBillableUnits: varchar("minimum_billable_units", { length: 30 }).notNull(),
  discountPercent: varchar("discount_percent", { length: 10 }).notNull(),
  label: varchar("label", { length: 120 }).notNull().default(""),
  isActive: boolean("is_active").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const adminPaymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  isActive: boolean("is_active").notNull(),
  mode: varchar("mode", { length: 16 }).notNull(),
});

export const adminCmsPages = pgTable("cms_pages", {
  id: uuid("id").primaryKey(),
  slug: varchar("slug", { length: 160 }).notNull(),
  title: varchar("title", { length: 190 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const adminBanners = pgTable("banners", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  imageUrl: text("image_url").notNull(),
  alt: varchar("alt", { length: 190 }).notNull(),
  targetUrl: text("target_url"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const adminPromoCodes = pgTable("promo_codes", {
  id: uuid("id").primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  discountType: varchar("discount_type", { length: 16 }).notNull(),
  discountValue: integer("discount_value").notNull(),
  usageCount: integer("usage_count").notNull(),
  usageLimit: integer("usage_limit"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull(),
});

export const adminSettings = pgTable("settings", {
  id: uuid("id").primaryKey(),
  key: varchar("key", { length: 120 }).notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  isSecret: boolean("is_secret").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const adminPaymentCountryRules = pgTable("payment_country_rules", {
  id: uuid("id").primaryKey(),
  paymentMethodId: uuid("payment_method_id").notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  isAllowed: boolean("is_allowed").notNull(),
  minimumAmountXof: integer("minimum_amount_xof").notNull(),
  maximumAmountXof: integer("maximum_amount_xof"),
});

export const adminUsers = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  role: varchar("role", { length: 24 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminCustomers = pgTable("customers", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  companyName: varchar("company_name", { length: 190 }),
  customerGroup: varchar("customer_group", { length: 80 }).notNull(),
  preferredLocale: varchar("preferred_locale", { length: 16 }).notNull(),
  marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminEmployees = pgTable("employees", {
  id: uuid("id").primaryKey(),
  roleId: uuid("role_id").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  totpEnabled: boolean("totp_enabled").notNull(),
  failedLoginCount: integer("failed_login_count").notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminConversations = pgTable("conversations", {
  id: uuid("id").primaryKey(),
  buyerId: uuid("buyer_id").notNull(),
  sellerId: uuid("seller_id").notNull(),
  productId: uuid("product_id").notNull(),
  kind: varchar("kind", { length: 24 }).notNull(),
  assignedEmployeeId: uuid("assigned_employee_id"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminMessages = pgTable("messages", {
  id: uuid("id").primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  senderId: uuid("sender_id"),
  senderEmployeeId: uuid("sender_employee_id"),
  authorType: varchar("author_type", { length: 24 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
