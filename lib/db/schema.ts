import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["buyer", "seller", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const verificationStatusEnum = pgEnum("verification_status", ["pending", "approved", "rejected", "suspended"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "pending_review", "approved", "published", "rejected", "archived"]);
export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point",
  "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid",
  "cancelled", "dispute", "refunded",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["orange_money", "mtn_momo", "wave", "card", "bank_transfer", "mock"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded", "cancelled"]);
export const escrowStatusEnum = pgEnum("escrow_status", ["blocked", "eligible", "release_pending", "released", "refund_pending", "refunded", "cancelled"]);
export const shipmentStatusEnum = pgEnum("shipment_status", ["draft", "collecting", "shipped", "arrived_abidjan", "closed", "cancelled"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "investigating", "resolved_buyer", "resolved_seller", "closed"]);
export const payoutStatusEnum = pgEnum("payout_status", ["requested", "approved", "processing", "paid", "rejected"]);
export const quoteRequestKindEnum = pgEnum("quote_request_kind", ["product", "sourcing"]);
export const quoteRequestStatusEnum = pgEnum("quote_request_status", ["new", "in_review", "quoted", "closed"]);
export const employeeStatusEnum = pgEnum("employee_status", ["active", "invited", "disabled", "locked"]);
export const shippingModeEnum = pgEnum("shipping_mode", ["air", "sea"]);
export const shippingPreferenceEnum = pgEnum("shipping_preference", ["air_only", "sea_only", "both", "automatic"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "issued", "void"]);
export const reviewSubjectEnum = pgEnum("review_subject", ["product", "supplier"]);
export const conversationKindEnum = pgEnum("conversation_kind", ["supplier", "support", "dispute"]);
export const messageAuthorEnum = pgEnum("message_author", ["customer", "supplier", "employee"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("buyer"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("users_email_unique").on(t.email), index("users_role_idx").on(t.role)]);

export const adminRoles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull().default(""),
  isSystem: boolean("is_system").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("roles_code_unique").on(t.code)]);

export const adminPermissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 120 }).notNull(),
  label: varchar("label", { length: 140 }).notNull(),
  resource: varchar("resource", { length: 60 }).notNull(),
  action: varchar("action", { length: 40 }).notNull(),
}, (t) => [uniqueIndex("permissions_code_unique").on(t.code), index("permissions_resource_idx").on(t.resource, t.action)]);

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id").notNull().references(() => adminRoles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => adminPermissions.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("role_permissions_pair_unique").on(t.roleId, t.permissionId), index("role_permissions_permission_idx").on(t.permissionId)]);

export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  roleId: uuid("role_id").notNull().references(() => adminRoles.id, { onDelete: "restrict" }),
  email: varchar("email", { length: 190 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: employeeStatusEnum("status").notNull().default("invited"),
  totpSecretEncrypted: text("totp_secret_encrypted"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("employees_email_unique").on(t.email), index("employees_status_idx").on(t.status), index("employees_role_idx").on(t.roleId)]);

export const employeeSessions = pgTable("employee_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("employee_sessions_token_hash_unique").on(t.tokenHash), index("employee_sessions_employee_active_idx").on(t.employeeId, t.expiresAt)]);

export const employeeLoginEvents = pgTable("employee_login_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  emailAttempted: varchar("email_attempted", { length: 190 }).notNull(),
  succeeded: boolean("succeeded").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  failureReason: varchar("failure_reason", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("employee_login_email_time_idx").on(t.emailAttempted, t.createdAt), index("employee_login_ip_time_idx").on(t.ipAddress, t.createdAt)]);

export const employeeSecurityEvents = pgTable("employee_security_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("employee_security_events_employee_time_idx").on(t.employeeId, t.createdAt)]);

export const employeeAuditLogs = pgTable("employee_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorEmployeeId: uuid("actor_employee_id").references(() => employees.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("employee_audit_actor_time_idx").on(t.actorEmployeeId, t.createdAt), index("employee_audit_entity_idx").on(t.entityType, t.entityId)]);

export const sellerProfiles = pgTable("seller_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  university: varchar("university", { length: 190 }).notNull(),
  cityChina: varchar("city_china", { length: 120 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 32 }),
  documents: jsonb("documents").$type<Array<{ name: string; pathname: string; contentType: string }>>().notNull().default([]),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("pending"),
  ratingAvg: decimal("rating_avg", { precision: 3, scale: 2 }).notNull().default("0"),
  ratingCount: integer("rating_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("seller_profiles_user_unique").on(t.userId), index("seller_profiles_status_idx").on(t.verificationStatus)]);

export const sellerStorefronts = pgTable("seller_storefronts", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 160 }).notNull(),
  storeName: varchar("store_name", { length: 120 }).notNull(),
  headline: varchar("headline", { length: 190 }).notNull().default("Boutique partenaire mybigmarket"),
  description: text("description").notNull().default(""),
  announcement: varchar("announcement", { length: 200 }),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("seller_storefronts_seller_unique").on(t.sellerId),
  uniqueIndex("seller_storefronts_slug_unique").on(t.slug),
  index("seller_storefronts_published_idx").on(t.isPublished, t.updatedAt),
]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  imageUrl: text("image_url"),
  bannerUrl: text("banner_url"),
  metaTitle: varchar("meta_title", { length: 190 }),
  metaDescription: varchar("meta_description", { length: 320 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("categories_slug_unique").on(t.slug), index("categories_parent_idx").on(t.parentId)]);

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull(),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  description: text("description"),
  metaTitle: varchar("meta_title", { length: 190 }),
  metaDescription: varchar("meta_description", { length: 320 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("brands_slug_unique").on(t.slug), uniqueIndex("brands_name_unique").on(t.name)]);

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerUserId: uuid("seller_user_id").references(() => users.id, { onDelete: "set null" }),
  companyName: varchar("company_name", { length: 190 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  city: varchar("city", { length: 120 }),
  yearsActive: integer("years_active"),
  ratingAverage: decimal("rating_average", { precision: 3, scale: 2 }),
  reviewCount: integer("review_count").notNull().default(0),
  responseTimeHours: decimal("response_time_hours", { precision: 8, scale: 2 }),
  onTimeDeliveryPercent: decimal("on_time_delivery_percent", { precision: 5, scale: 2 }),
  mainMarkets: jsonb("main_markets").$type<string[]>().notNull().default([]),
  profileStatus: varchar("profile_status", { length: 24 }).notNull().default("unverified"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  logoUrl: text("logo_url"),
  description: text("description"),
  contactEmail: varchar("contact_email", { length: 190 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("suppliers_slug_unique").on(t.slug), index("suppliers_country_active_idx").on(t.countryCode, t.isActive), index("suppliers_user_idx").on(t.sellerUserId)]);

export const productTypeEnum = pgEnum("product_type", ["standard", "pack", "virtual"]);
export const productConditionEnum = pgEnum("product_condition", ["new", "used", "refurbished"]);
export const productVisibilityEnum = pgEnum("product_visibility", ["everywhere", "catalog", "search", "nowhere"]);
export const outOfStockBehaviorEnum = pgEnum("out_of_stock_behavior", ["refuse", "backorder", "use_default"]);
export const redirectTypeEnum = pgEnum("redirect_type", ["301", "302"]);
export const redirectTargetTypeEnum = pgEnum("redirect_target_type", ["category", "product", "url"]);
export const customizationTypeEnum = pgEnum("customization_type", ["text", "file"]);
export const stockMovementReasonEnum = pgEnum("stock_movement_reason", ["purchase", "sale", "return", "adjustment", "loss", "restock", "pack", "cancellation"]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  sku: varchar("sku", { length: 80 }),
  reference: varchar("reference", { length: 64 }),
  title: varchar("title", { length: 190 }).notNull(),
  slug: varchar("slug", { length: 210 }).notNull(),
  shortDescription: varchar("short_description", { length: 320 }),
  description: text("description").notNull(),
  internalNote: text("internal_note"),
  priceXof: integer("price_xof").notNull(),
  purchasePriceXof: integer("purchase_price_xof"),
  seoTitle: varchar("seo_title", { length: 190 }),
  seoDescription: varchar("seo_description", { length: 320 }),
  openGraphImageUrl: text("open_graph_image_url"),
  canonicalPath: varchar("canonical_path", { length: 300 }),
  allowReviews: boolean("allow_reviews").notNull().default(true),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  quantity: integer("quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  minimumQuantity: integer("minimum_quantity").notNull().default(1),
  leadTimeDays: integer("lead_time_days").notNull().default(35),
  status: productStatusEnum("status").notNull().default("pending_review"),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  version: integer("version").notNull().default(0),
  position: integer("position").notNull().default(0),
  taxRuleGroupId: uuid("tax_rule_group_id").references(() => taxRuleGroups.id, { onDelete: "set null" }),
productType: productTypeEnum("product_type").notNull().default("standard"),
  ean13: varchar("ean13", { length: 13 }),
  upc: varchar("upc", { length: 12 }),
  isbn: varchar("isbn", { length: 17 }),
  mpn: varchar("mpn", { length: 40 }),
  condition: productConditionEnum("condition").notNull().default("new"),
  visibility: productVisibilityEnum("visibility").notNull().default("everywhere"),
  availableForOrder: boolean("available_for_order").notNull().default(true),
  showPrice: boolean("show_price").notNull().default(true),
  outOfStockBehavior: outOfStockBehaviorEnum("out_of_stock_behavior").notNull().default("use_default"),
  restockDate: timestamp("restock_date", { withTimezone: true }),
  inStockMessage: varchar("in_stock_message", { length: 120 }),
  outOfStockMessage: varchar("out_of_stock_message", { length: 120 }),
  ecotaxXof: integer("ecotax_xof").notNull().default(0),
  unitPriceXof: integer("unit_price_xof"),
  unitLabel: varchar("unit_label", { length: 20 }),
  weightGrams: integer("weight_grams").notNull().default(0),
  lengthMm: integer("length_mm").notNull().default(0),
  widthMm: integer("width_mm").notNull().default(0),
  heightMm: integer("height_mm").notNull().default(0),
  additionalShippingXof: integer("additional_shipping_xof").notNull().default(0),
  deliveryTimeDays: integer("delivery_time_days"),
  redirectType: redirectTypeEnum("redirect_type"),
  redirectTargetType: redirectTargetTypeEnum("redirect_target_type"),
}, (t) => [uniqueIndex("products_slug_unique").on(t.slug), uniqueIndex("products_sku_unique").on(t.sku), index("products_seller_idx").on(t.sellerId), index("products_supplier_idx").on(t.supplierId), index("products_brand_idx").on(t.brandId), index("products_category_idx").on(t.categoryId), index("products_listing_idx").on(t.status, t.categoryId), uniqueIndex("products_reference_unique").on(t.reference).where(sql`${t.deletedAt} IS NULL AND ${t.reference} IS NOT NULL`), index("products_ean13_idx").on(t.ean13), index("products_type_idx").on(t.productType, t.deletedAt)]);

export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 190 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder), uniqueIndex("product_images_one_primary_unique").on(t.productId).where(sql`${t.isPrimary} = true`)]);

export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  value: varchar("value", { length: 120 }).notNull(),
  sku: varchar("sku", { length: 80 }),
  attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
  priceXof: integer("price_xof"),
  priceDeltaXof: integer("price_delta_xof").notNull().default(0),
  stock: integer("stock").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  ean13: varchar("ean13", { length: 13 }),
  upc: varchar("upc", { length: 12 }),
  weightImpactGrams: integer("weight_impact_grams").notNull().default(0),
  minimumQuantity: integer("minimum_quantity"),
  isDefault: boolean("is_default").notNull().default(false),
  combinationKey: varchar("combination_key", { length: 64 }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  position: integer("position").notNull().default(0),
}, (t) => [uniqueIndex("product_variants_product_name_value_unique").on(t.productId, t.name, t.value), uniqueIndex("product_variants_sku_unique").on(t.sku), index("product_variants_product_idx").on(t.productId, t.isActive)]);

export const pickupPoints = pgTable("pickup_points", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  openingHours: varchar("opening_hours", { length: 190 }),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("pickup_points_name_city_unique").on(t.name, t.city), index("pickup_points_city_active_idx").on(t.city, t.isActive)]);

export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  batchRef: varchar("batch_ref", { length: 64 }).notNull(),
  status: shipmentStatusEnum("status").notNull().default("draft"),
  origin: varchar("origin", { length: 120 }).notNull().default("Chine"),
  destination: varchar("destination", { length: 120 }).notNull().default("Abidjan"),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("shipments_batch_ref_unique").on(t.batchRef), index("shipments_status_idx").on(t.status)]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  shipmentId: integer("shipment_id").references(() => shipments.id, { onDelete: "set null" }),
  pickupPointId: integer("pickup_point_id").references(() => pickupPoints.id, { onDelete: "set null" }),
  totalXof: integer("total_xof").notNull(),
  shippingCostXof: integer("shipping_cost_xof").notNull().default(0),
  shippingMode: shippingModeEnum("shipping_mode"),
  shippingQuoteSnapshot: jsonb("shipping_quote_snapshot").$type<Record<string, unknown>>(),
  status: orderStatusEnum("status").notNull().default("awaiting_payment"),
  deliveryAddress: jsonb("delivery_address").$type<Record<string, string> | null>(),
  deliveryMethod: varchar("delivery_method", { length: 20 }).notNull().default("delivery"),
  paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("orders_buyer_idx").on(t.buyerId, t.createdAt), index("orders_status_idx").on(t.status), index("orders_shipment_idx").on(t.shipmentId)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  kind: conversationKindEnum("kind").notNull().default("supplier"),
  assignedEmployeeId: uuid("assigned_employee_id").references(() => employees.id, { onDelete: "set null" }),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("conversations_buyer_seller_product_unique").on(t.buyerId, t.sellerId, t.productId),
  index("conversations_buyer_recent_idx").on(t.buyerId, t.lastMessageAt),
  index("conversations_seller_recent_idx").on(t.sellerId, t.lastMessageAt),
]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id, { onDelete: "cascade" }),
  senderEmployeeId: uuid("sender_employee_id").references(() => employees.id, { onDelete: "set null" }),
  authorType: messageAuthorEnum("author_type").notNull().default("customer"),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_conversation_time_idx").on(t.conversationId, t.createdAt), index("messages_sender_read_idx").on(t.senderId, t.readAt), index("messages_employee_idx").on(t.senderEmployeeId, t.createdAt)]);

export const quoteRequests = pgTable("quote_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").references(() => users.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  kind: quoteRequestKindEnum("kind").notNull(),
  status: quoteRequestStatusEnum("status").notNull().default("new"),
  productTitle: varchar("product_title", { length: 190 }).notNull(),
  quantity: integer("quantity").notNull(),
  destination: varchar("destination", { length: 120 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 32 }).notNull(),
  message: text("message").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("quote_requests_buyer_recent_idx").on(t.buyerId, t.createdAt),
  index("quote_requests_seller_recent_idx").on(t.sellerId, t.createdAt),
  index("quote_requests_status_recent_idx").on(t.status, t.createdAt),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPriceXof: integer("unit_price_xof").notNull(),
  appliedTierMinimumQuantity: integer("applied_tier_minimum_quantity").notNull().default(1),
  shippingMode: shippingModeEnum("shipping_mode"),
  shippingCostXof: integer("shipping_cost_xof").notNull().default(0),
  variantSnapshot: jsonb("variant_snapshot").$type<Record<string, string>>().notNull().default({}),
  productTitle: varchar("product_title", { length: 190 }).notNull(),
}, (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_seller_idx").on(t.sellerId)]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amountXof: integer("amount_xof").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  provider: varchar("provider", { length: 80 }).notNull().default("mock"),
  providerReference: varchar("provider_reference", { length: 190 }),
  countryCode: varchar("country_code", { length: 2 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  externalReference: varchar("external_reference", { length: 190 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("payments_order_idx").on(t.orderId), uniqueIndex("payments_reference_unique").on(t.externalReference)]);

export const escrowEntries = pgTable("escrow_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  amountXof: integer("amount_xof").notNull(),
  commissionBps: integer("commission_bps").notNull().default(800),
  commissionXof: integer("commission_xof").notNull(),
  sellerNetXof: integer("seller_net_xof").notNull(),
  status: escrowStatusEnum("status").notNull().default("blocked"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("escrow_order_unique").on(t.orderId), index("escrow_status_idx").on(t.status)]);

export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  status: orderStatusEnum("status").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("order_events_order_time_idx").on(t.orderId, t.createdAt)]);

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  balanceXof: integer("balance_xof").notNull().default(0),
  pendingXof: integer("pending_xof").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("wallets_seller_unique").on(t.sellerId)]);

export const payouts = pgTable("payouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amountXof: integer("amount_xof").notNull(),
  method: varchar("method", { length: 40 }).notNull(),
  destinationMasked: varchar("destination_masked", { length: 120 }),
  status: payoutStatusEnum("status").notNull().default("requested"),
  externalReference: varchar("external_reference", { length: 190 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("payouts_seller_status_idx").on(t.sellerId, t.status)]);

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject: reviewSubjectEnum("subject").notNull().default("product"),
  supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  verifiedPurchase: boolean("verified_purchase").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  moderatedByEmployeeId: uuid("moderated_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reviews_order_product_buyer_unique").on(t.orderId, t.productId, t.buyerId), index("reviews_product_publish_idx").on(t.productId, t.isPublished, t.verifiedPurchase), index("reviews_supplier_publish_idx").on(t.supplierId, t.isPublished, t.verifiedPurchase)]);

export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 80 }).notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
  status: disputeStatusEnum("status").notNull().default("open"),
  decision: text("decision"),
  resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("disputes_order_idx").on(t.orderId), index("disputes_status_idx").on(t.status)]);

export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 80 }).notNull(),
  value: varchar("value", { length: 240 }).notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("platform_settings_key_unique").on(t.key)]);

export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  details: jsonb("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
  afterState: jsonb("after_state").$type<Record<string, unknown>>(),
  changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
}, (t) => [index("admin_audit_actor_time_idx").on(t.actorUserId, t.createdAt), index("admin_audit_entity_idx").on(t.entityType, t.entityId)]);

export const customerGroups = pgTable("customer_groups", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  discountBasisPoints: integer("discount_basis_points").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("customer_groups_code_unique").on(t.code), index("customer_groups_active_idx").on(t.isActive)]);

export const customers = pgTable("customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("company_name", { length: 190 }),
  taxNumber: varchar("tax_number", { length: 80 }),
  preferredLocale: varchar("preferred_locale", { length: 16 }).notNull().default("fr-CI"),
  preferredCurrency: varchar("preferred_currency", { length: 3 }).notNull().default("XOF"),
  customerGroupId: integer("customer_group_id").references(() => customerGroups.id, { onDelete: "set null" }),
  customerGroup: varchar("customer_group", { length: 80 }).notNull().default("default"),
  marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("customers_user_unique").on(t.userId), index("customers_group_idx").on(t.customerGroup)]);

export const customerAddresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 80 }).notNull().default("Adresse"),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  companyName: varchar("company_name", { length: 190 }),
  phone: varchar("phone", { length: 32 }).notNull(),
  line1: varchar("line_1", { length: 190 }).notNull(),
  line2: varchar("line_2", { length: 190 }),
  city: varchar("city", { length: 120 }).notNull(),
  region: varchar("region", { length: 120 }),
  postalCode: varchar("postal_code", { length: 24 }),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  isDefaultShipping: boolean("is_default_shipping").notNull().default(false),
  isDefaultBilling: boolean("is_default_billing").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("addresses_customer_idx").on(t.customerId), index("addresses_country_city_idx").on(t.countryCode, t.city)]);

export const carts = pgTable("carts", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  guestTokenHash: varchar("guest_token_hash", { length: 128 }),
  currency: varchar("currency", { length: 3 }).notNull().default("XOF"),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
  convertedOrderId: uuid("converted_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("carts_guest_token_unique").on(t.guestTokenHash), index("carts_customer_status_idx").on(t.customerId, t.status), index("carts_abandoned_idx").on(t.status, t.abandonedAt)]);

export const cartItems = pgTable("cart_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cart_items_product_without_variant_unique").on(t.cartId, t.productId).where(sql`${t.variantId} IS NULL`), uniqueIndex("cart_items_product_variant_unique").on(t.cartId, t.productId, t.variantId).where(sql`${t.variantId} IS NOT NULL`), index("cart_items_product_idx").on(t.productId)]);

export const productPriceTiers = pgTable("price_tiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "cascade" }),
  minimumQuantity: integer("minimum_quantity").notNull(),
  maximumQuantity: integer("maximum_quantity"),
  unitPriceXof: integer("unit_price_xof").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("price_tiers_default_variant_min_unique").on(t.productId, t.minimumQuantity).where(sql`${t.variantId} IS NULL`), uniqueIndex("price_tiers_specific_variant_min_unique").on(t.productId, t.variantId, t.minimumQuantity).where(sql`${t.variantId} IS NOT NULL`), index("price_tiers_product_qty_idx").on(t.productId, t.minimumQuantity)]);

export const productAttributes = pgTable("product_attributes", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  value: text("value").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("product_attributes_product_idx").on(t.productId, t.sortOrder), index("product_attributes_name_idx").on(t.name)]);

export const productKeyAttributes = pgTable("product_key_attributes", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  attributeId: uuid("attribute_id").notNull().references(() => productAttributes.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
}, (t) => [uniqueIndex("product_key_attributes_product_order_unique").on(t.productId, t.sortOrder), uniqueIndex("product_key_attributes_attribute_unique").on(t.productId, t.attributeId)]);

export const productPackaging = pgTable("product_packaging", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  unitsPerSale: integer("units_per_sale").notNull().default(1),
  lengthCm: decimal("length_cm", { precision: 10, scale: 2 }).notNull().default("0"),
  widthCm: decimal("width_cm", { precision: 10, scale: 2 }).notNull().default("0"),
  heightCm: decimal("height_cm", { precision: 10, scale: 2 }).notNull().default("0"),
  grossWeightKg: decimal("gross_weight_kg", { precision: 10, scale: 3 }).notNull().default("0"),
  shippingPreference: shippingPreferenceEnum("shipping_preference").notNull().default("automatic"),
  fragile: boolean("fragile").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("product_packaging_product_unique").on(t.productId)]);

export const productLeadTimes = pgTable("lead_times", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  minimumQuantity: integer("minimum_quantity").notNull(),
  maximumQuantity: integer("maximum_quantity"),
  preparationDays: integer("preparation_days"),
  negotiable: boolean("negotiable").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("lead_times_product_order_idx").on(t.productId, t.sortOrder)]);

export const productAttachments = pgTable("product_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 190 }).notNull(),
  url: text("url").notNull(),
  contentType: varchar("content_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedByEmployeeId: uuid("uploaded_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("product_attachments_product_idx").on(t.productId, t.createdAt)]);

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  quantityDelta: integer("quantity_delta").notNull(),
  movementType: varchar("movement_type", { length: 32 }).notNull(),
  reason: text("reason").notNull(),
  reference: varchar("reference", { length: 120 }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("inventory_movements_product_time_idx").on(t.productId, t.createdAt), index("inventory_movements_variant_time_idx").on(t.variantId, t.createdAt)]);

export const productKeywords = pgTable("product_keywords", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  keyword: varchar("keyword", { length: 160 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("product_keywords_product_keyword_unique").on(t.productId, t.keyword), index("product_keywords_keyword_idx").on(t.keyword)]);

export const relatedProducts = pgTable("related_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  relatedProductId: uuid("related_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  relationType: varchar("relation_type", { length: 32 }).notNull().default("related"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("related_products_pair_type_unique").on(t.productId, t.relatedProductId, t.relationType), index("related_products_product_order_idx").on(t.productId, t.relationType, t.sortOrder)]);

export const orderStatuses = pgTable("order_statuses", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 48 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull().default("#64748b"),
  sortOrder: integer("sort_order").notNull().default(0),
  isTerminal: boolean("is_terminal").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("order_statuses_code_unique").on(t.code), index("order_statuses_active_order_idx").on(t.isActive, t.sortOrder)]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 48 }),
  toStatus: varchar("to_status", { length: 48 }).notNull(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("order_status_history_order_time_idx").on(t.orderId, t.createdAt), index("order_status_history_employee_idx").on(t.employeeId)]);

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  invoiceNumber: varchar("invoice_number", { length: 60 }).notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  subtotalXof: integer("subtotal_xof").notNull(),
  shippingXof: integer("shipping_xof").notNull().default(0),
  taxXof: integer("tax_xof").notNull().default(0),
  totalXof: integer("total_xof").notNull(),
  pdfUrl: text("pdf_url"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("invoices_number_unique").on(t.invoiceNumber), uniqueIndex("invoices_order_unique").on(t.orderId), index("invoices_status_idx").on(t.status)]);

export const creditNotes = pgTable("credit_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  creditNoteNumber: varchar("credit_note_number", { length: 60 }).notNull(),
  amountXof: integer("amount_xof").notNull(),
  reason: text("reason").notNull(),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("credit_notes_number_unique").on(t.creditNoteNumber), index("credit_notes_order_idx").on(t.orderId)]);

export const paymentMethodConfigs = pgTable("payment_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  supportedCurrencies: jsonb("supported_currencies").$type<string[]>().notNull().default(["XOF"]),
  mode: varchar("mode", { length: 16 }).notNull().default("test"),
  configurationNote: text("configuration_note").notNull().default("Credentials belong in environment variables, never in this table."),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("payment_methods_code_unique").on(t.code), index("payment_methods_active_idx").on(t.isActive)]);

export const paymentCountryRules = pgTable("payment_country_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentMethodId: uuid("payment_method_id").notNull().references(() => paymentMethodConfigs.id, { onDelete: "cascade" }),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  isAllowed: boolean("is_allowed").notNull().default(false),
  minimumAmountXof: integer("minimum_amount_xof").notNull().default(0),
  maximumAmountXof: integer("maximum_amount_xof"),
}, (t) => [uniqueIndex("payment_country_rules_method_country_unique").on(t.paymentMethodId, t.countryCode), index("payment_country_rules_country_idx").on(t.countryCode, t.isAllowed)]);

export const shippingMethods = pgTable("shipping_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 30 }).notNull(),
  mode: shippingModeEnum("mode").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  sampleRatesOnly: boolean("sample_rates_only").notNull().default(true),
  volumetricDivisor: integer("volumetric_divisor").notNull().default(6000),
  minimumBillableWeightKg: decimal("minimum_billable_weight_kg", { precision: 10, scale: 3 }).notNull().default("0.5"),
  maximumRecommendedWeightKg: decimal("maximum_recommended_weight_kg", { precision: 10, scale: 3 }).notNull().default("150"),
  seaMinimumVolumeM3: decimal("sea_minimum_volume_m3", { precision: 10, scale: 4 }).notNull().default("0.1"),
  seaRecommendationWeightKg: decimal("sea_recommendation_weight_kg", { precision: 10, scale: 3 }).notNull().default("100"),
  seaRecommendationVolumeM3: decimal("sea_recommendation_volume_m3", { precision: 10, scale: 4 }).notNull().default("0.3"),
  minimumChargeXof: integer("minimum_charge_xof").notNull().default(0),
  insurancePercent: decimal("insurance_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  customsHandlingXof: integer("customs_handling_xof").notNull().default(0),
  fragileSurchargeXof: integer("fragile_surcharge_xof").notNull().default(0),
  transitDaysMin: integer("transit_days_min").notNull(),
  transitDaysMax: integer("transit_days_max").notNull(),
  configurationNote: text("configuration_note").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("shipping_methods_code_unique").on(t.code), index("shipping_methods_active_mode_idx").on(t.isActive, t.mode)]);

export const shippingZones = pgTable("shipping_zones", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  countryCodes: jsonb("country_codes").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("shipping_zones_code_unique").on(t.code), index("shipping_zones_active_order_idx").on(t.isActive, t.sortOrder)]);

export const shippingRates = pgTable("shipping_rates", {
  id: uuid("id").defaultRandom().primaryKey(),
  shippingMethodId: uuid("shipping_method_id").notNull().references(() => shippingMethods.id, { onDelete: "cascade" }),
  shippingZoneId: uuid("shipping_zone_id").notNull().references(() => shippingZones.id, { onDelete: "cascade" }),
  minimumBillableUnits: decimal("minimum_billable_units", { precision: 12, scale: 4 }).notNull(),
  maximumBillableUnits: decimal("maximum_billable_units", { precision: 12, scale: 4 }),
  rateXofPerUnit: integer("rate_xof_per_unit").notNull(),
  minimumChargeXof: integer("minimum_charge_xof").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  sampleOnly: boolean("sample_only").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("shipping_rates_lookup_idx").on(t.shippingMethodId, t.shippingZoneId, t.sortOrder)]);

export const shippingRules = pgTable("shipping_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  shippingMethodId: uuid("shipping_method_id").notNull().references(() => shippingMethods.id, { onDelete: "cascade" }),
  shippingZoneId: uuid("shipping_zone_id").references(() => shippingZones.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 80 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  configuration: jsonb("configuration").$type<Record<string, string | number | boolean>>().notNull().default({}),
  isEnabled: boolean("is_enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
}, (t) => [uniqueIndex("shipping_rules_global_method_code_unique").on(t.shippingMethodId, t.code).where(sql`${t.shippingZoneId} IS NULL`), uniqueIndex("shipping_rules_zoned_method_code_unique").on(t.shippingMethodId, t.shippingZoneId, t.code).where(sql`${t.shippingZoneId} IS NOT NULL`), index("shipping_rules_method_priority_idx").on(t.shippingMethodId, t.isEnabled, t.priority)]);

export const shipmentOrders = pgTable("shipment_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  shippingMethodId: uuid("shipping_method_id").references(() => shippingMethods.id, { onDelete: "set null" }),
  mode: shippingModeEnum("mode"),
  quotedCostXof: integer("quoted_cost_xof"),
  trackingNumber: varchar("tracking_number", { length: 120 }),
  trackingUrl: text("tracking_url"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (t) => [uniqueIndex("shipment_orders_order_unique").on(t.orderId), index("shipment_orders_shipment_idx").on(t.shipmentId)]);

export const promoCodes = pgTable("promo_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 64 }).notNull(),
  discountType: varchar("discount_type", { length: 16 }).notNull(),
  discountValue: integer("discount_value").notNull(),
  minimumSubtotalXof: integer("minimum_subtotal_xof").notNull().default(0),
  maximumDiscountXof: integer("maximum_discount_xof"),
  usageLimit: integer("usage_limit"),
  usageCount: integer("usage_count").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("promo_codes_code_unique").on(t.code), index("promo_codes_active_period_idx").on(t.isActive, t.startsAt, t.endsAt)]);

export const cmsPages = pgTable("cms_pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 160 }).notNull(),
  title: varchar("title", { length: 190 }).notNull(),
  body: text("body").notNull().default(""),
  metaTitle: varchar("meta_title", { length: 190 }),
  metaDescription: varchar("meta_description", { length: 320 }),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  updatedByEmployeeId: uuid("updated_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("cms_pages_slug_unique").on(t.slug), index("cms_pages_status_idx").on(t.status)]);

export const banners = pgTable("banners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  imageUrl: text("image_url").notNull(),
  alt: varchar("alt", { length: 190 }).notNull(),
  targetUrl: text("target_url"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("banners_active_order_idx").on(t.isActive, t.sortOrder)]);

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 60 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
  afterState: jsonb("after_state").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("activity_logs_actor_time_idx").on(t.employeeId, t.createdAt), index("activity_logs_entity_idx").on(t.entityType, t.entityId)]);

export const exchangeRates = pgTable("exchange_rates", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("XOF"),
  quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
  rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
  source: varchar("source", { length: 80 }).notNull().default("admin"),
  isIndicative: boolean("is_indicative").notNull().default(true),
  updatedByEmployeeId: uuid("updated_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("exchange_rates_currency_pair_unique").on(t.baseCurrency, t.quoteCurrency), index("exchange_rates_updated_idx").on(t.updatedAt)]);

export const taxRules = pgTable("tax_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  countryCode: varchar("country_code", { length: 2 }).notNull(),
  region: varchar("region", { length: 120 }),
  label: varchar("label", { length: 120 }).notNull(),
  ratePercent: decimal("rate_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  isIncludedInPrice: boolean("is_included_in_price").notNull().default(false),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tax_rules_code_country_region_unique").on(t.code, t.countryCode, t.region), index("tax_rules_country_active_idx").on(t.countryCode, t.isActive)]);

export const settings = pgTable("settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 120 }).notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedByEmployeeId: uuid("updated_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("settings_key_unique").on(t.key)]);

export const slugRedirects = pgTable("slug_redirects", {
  id: uuid("id").defaultRandom().primaryKey(),
  oldPath: varchar("old_path", { length: 300 }).notNull(),
  newPath: varchar("new_path", { length: 300 }).notNull(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("slug_redirects_old_path_unique").on(t.oldPath), index("slug_redirects_product_idx").on(t.productId)]);

export const usersRelations = relations(users, ({ many, one }) => ({
  products: many(products), orders: many(orders), sellerProfile: one(sellerProfiles), wallet: one(wallets),
}));
export const sellerProfilesRelations = relations(sellerProfiles, ({ one }) => ({ user: one(users, { fields: [sellerProfiles.userId], references: [users.id] }) }));
export const productsRelations = relations(products, ({ one, many }) => ({
  seller: one(users, { fields: [products.sellerId], references: [users.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages), variants: many(productVariants),
}));
export const categoriesRelations = relations(categories, ({ one, many }) => ({ parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: "categoryTree" }), children: many(categories, { relationName: "categoryTree" }), products: many(products) }));
export const ordersRelations = relations(orders, ({ one, many }) => ({ buyer: one(users, { fields: [orders.buyerId], references: [users.id] }), items: many(orderItems), events: many(orderEvents), payment: one(payments), escrow: one(escrowEntries) }));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({ order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }), product: one(products, { fields: [orderItems.productId], references: [products.id] }), seller: one(users, { fields: [orderItems.sellerId], references: [users.id] }) }));

// ─────────────────────────────────────────────────────────────────────────────
// Étape 1 — socle : extensions extensibilité, attributs normalisés, corbeille,
// clés d'API et traductions. Aucune table existante n'est renommée ni supprimée.
// ─────────────────────────────────────────────────────────────────────────────

export const attributeDisplayTypeEnum = pgEnum("attribute_display_type", ["color", "texture", "select", "radio"]);
export const moduleHookStatusEnum = pgEnum("module_hook_status", ["idle", "ok", "error"]);

export const attributeGroups = pgTable("attribute_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  displayType: attributeDisplayTypeEnum("display_type").notNull().default("select"),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("attribute_groups_code_unique").on(t.code), index("attribute_groups_active_position_idx").on(t.isActive, t.position)]);

export const attributeValues = pgTable("attribute_values", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id").notNull().references(() => attributeGroups.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  colorHex: varchar("color_hex", { length: 7 }),
  textureUrl: text("texture_url"),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("attribute_values_group_code_unique").on(t.groupId, t.code), index("attribute_values_group_position_idx").on(t.groupId, t.position)]);

export const features = pgTable("features", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("features_code_unique").on(t.code), index("features_active_position_idx").on(t.isActive, t.position)]);

export const featureValues = pgTable("feature_values", {
  id: uuid("id").defaultRandom().primaryKey(),
  featureId: uuid("feature_id").notNull().references(() => features.id, { onDelete: "cascade" }),
  value: varchar("value", { length: 190 }).notNull(),
  position: integer("position").notNull().default(0),
}, (t) => [uniqueIndex("feature_values_feature_value_unique").on(t.featureId, t.value), index("feature_values_feature_position_idx").on(t.featureId, t.position)]);

export const productFeatureValues = pgTable("product_feature_values", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  featureId: uuid("feature_id").notNull().references(() => features.id, { onDelete: "cascade" }),
  featureValueId: uuid("feature_value_id").references(() => featureValues.id, { onDelete: "set null" }),
  customValue: varchar("custom_value", { length: 190 }),
}, (t) => [uniqueIndex("product_feature_values_unique").on(t.productId, t.featureId), index("product_feature_values_feature_idx").on(t.featureId, t.featureValueId)]);

export const productCombinationAttributes = pgTable("product_combination_attributes", {
  id: serial("id").primaryKey(),
  variantId: integer("variant_id").notNull().references(() => productVariants.id, { onDelete: "cascade" }),
  attributeValueId: uuid("attribute_value_id").notNull().references(() => attributeValues.id, { onDelete: "restrict" }),
}, (t) => [uniqueIndex("product_combination_attributes_unique").on(t.variantId, t.attributeValueId), index("product_combination_attributes_value_idx").on(t.attributeValueId)]);

export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  version: varchar("version", { length: 20 }).notNull().default("1.0.0"),
  description: text("description").notNull().default(""),
  isActive: boolean("is_active").notNull().default(false),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("modules_code_unique").on(t.code), index("modules_active_idx").on(t.isActive)]);

export const hooks = pgTable("hooks", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 80 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("hooks_code_unique").on(t.code)]);

export const moduleHooks = pgTable("module_hooks", {
  id: serial("id").primaryKey(),
  moduleId: uuid("module_id").notNull().references(() => modules.id, { onDelete: "cascade" }),
  hookCode: varchar("hook_code", { length: 80 }).notNull().references(() => hooks.code, { onDelete: "cascade", onUpdate: "cascade" }),
  priority: integer("priority").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("module_hooks_unique").on(t.moduleId, t.hookCode), index("module_hooks_lookup_idx").on(t.hookCode, t.isActive, t.priority)]);

export const moduleEventsLog = pgTable("module_events_log", {
  id: serial("id").primaryKey(),
  hookCode: varchar("hook_code", { length: 80 }).notNull(),
  moduleCode: varchar("module_code", { length: 60 }).notNull(),
  status: moduleHookStatusEnum("status").notNull().default("ok"),
  payloadHash: varchar("payload_hash", { length: 64 }),
  error: text("error"),
  durationMs: integer("duration_ms"),
  executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("module_events_log_hook_idx").on(t.hookCode, t.executedAt), index("module_events_log_module_idx").on(t.moduleCode, t.executedAt)]);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: varchar("label", { length: 120 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  keyHash: varchar("key_hash", { length: 64 }).notNull(),
  permissions: jsonb("permissions").$type<Record<string, Array<"GET" | "POST" | "PUT" | "DELETE">>>().notNull().default({}),
  allowedIps: jsonb("allowed_ips").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdByEmployeeId: uuid("created_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("api_keys_hash_unique").on(t.keyHash), index("api_keys_prefix_idx").on(t.keyPrefix), index("api_keys_active_idx").on(t.isActive)]);

export const translations = pgTable("translations", {
  id: serial("id").primaryKey(),
  entity: varchar("entity", { length: 40 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  locale: varchar("locale", { length: 5 }).notNull(),
  field: varchar("field", { length: 40 }).notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("translations_unique").on(t.entity, t.entityId, t.locale, t.field), index("translations_lookup_idx").on(t.entity, t.entityId, t.locale)]);

// ─────────────────────────────────────────────────────────────────────────────
// Étape 2 — localisation, taxes et e-mails.
// `settings`, `exchange_rates` et `tax_rules` existent déjà : on les complète
// au lieu de créer des doublons.
// ─────────────────────────────────────────────────────────────────────────────

export const addressFormatHintEnum = pgEnum("address_format_hint", ["standard", "postal_then_city", "city_then_postal", "no_postal"]);

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  iso2: varchar("iso2", { length: 2 }).notNull(),
  iso3: varchar("iso3", { length: 3 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  callingCode: varchar("calling_code", { length: 8 }),
  shippingZoneId: uuid("shipping_zone_id").references(() => shippingZones.id, { onDelete: "set null" }),
  needZipCode: boolean("need_zip_code").notNull().default(true),
  zipCodeFormat: varchar("zip_code_format", { length: 40 }),
  addressFormat: addressFormatHintEnum("address_format").notNull().default("standard"),
  isActive: boolean("is_active").notNull().default(true),
  position: integer("position").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("countries_iso2_unique").on(t.iso2), index("countries_active_position_idx").on(t.isActive, t.position), index("countries_zone_idx").on(t.shippingZoneId)]);

export const states = pgTable("states", {
  id: serial("id").primaryKey(),
  countryId: integer("country_id").notNull().references(() => countries.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  isoCode: varchar("iso_code", { length: 8 }),
  shippingZoneId: uuid("shipping_zone_id").references(() => shippingZones.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("states_country_name_unique").on(t.countryId, t.name), index("states_country_active_idx").on(t.countryId, t.isActive)]);

export const currencies = pgTable("currencies", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 3 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  symbol: varchar("symbol", { length: 8 }).notNull(),
  decimals: integer("decimals").notNull().default(0),
  symbolPosition: varchar("symbol_position", { length: 10 }).notNull().default("after"),
  conversionRate: decimal("conversion_rate", { precision: 18, scale: 8 }).notNull().default("1"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("currencies_code_unique").on(t.code), index("currencies_default_idx").on(t.isDefault)]);

export const languages = pgTable("languages", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 5 }).notNull(),
  name: varchar("name", { length: 60 }).notNull(),
  locale: varchar("locale", { length: 10 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [uniqueIndex("languages_code_unique").on(t.code)]);

export const taxRuleGroups = pgTable("tax_rule_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("tax_rule_groups_name_unique").on(t.name), index("tax_rule_groups_active_idx").on(t.isActive)]);

export const taxRuleGroupRules = pgTable("tax_rule_group_rules", {
  id: serial("id").primaryKey(),
  taxRuleGroupId: uuid("tax_rule_group_id").notNull().references(() => taxRuleGroups.id, { onDelete: "cascade" }),
  taxRuleId: uuid("tax_rule_id").notNull().references(() => taxRules.id, { onDelete: "cascade" }),
  countryCode: varchar("country_code", { length: 2 }),
  priority: integer("priority").notNull().default(0),
}, (t) => [index("tax_rule_group_rules_group_idx").on(t.taxRuleGroupId, t.countryCode), index("tax_rule_group_rules_rule_idx").on(t.taxRuleId)]);

export const emailTemplateStatusEnum = pgEnum("email_template_status", ["draft", "active", "archived"]);
export const emailQueueStatusEnum = pgEnum("email_queue_status", ["pending", "sending", "sent", "failed"]);

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 60 }).notNull(),
  locale: varchar("locale", { length: 5 }).notNull().default("fr"),
  name: varchar("name", { length: 160 }).notNull(),
  subject: varchar("subject", { length: 240 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text"),
  /** Variables autorisées, pour l'aide à l'édition. */
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  status: emailTemplateStatusEnum("status").notNull().default("draft"),
  isActive: boolean("is_active").notNull().default(true),
  updatedByEmployeeId: uuid("updated_by_employee_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("email_templates_code_locale_unique").on(t.code, t.locale), index("email_templates_active_idx").on(t.isActive, t.code)]);

export const emailQueue = pgTable("email_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  toAddress: varchar("to_address", { length: 190 }).notNull(),
  templateCode: varchar("template_code", { length: 60 }),
  subject: varchar("subject", { length: 240 }).notNull(),
  bodyHtml: text("body_html").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: emailQueueStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("email_queue_status_schedule_idx").on(t.status, t.scheduledAt), index("email_queue_created_idx").on(t.createdAt)]);

export const emailLog = pgTable("email_log", {
  id: serial("id").primaryKey(),
  queueId: uuid("queue_id").references(() => emailQueue.id, { onDelete: "set null" }),
  toAddress: varchar("to_address", { length: 190 }).notNull(),
  subject: varchar("subject", { length: 240 }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull().default("smtp"),
  status: varchar("status", { length: 24 }).notNull(),
  error: text("error"),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("email_log_created_idx").on(t.createdAt), index("email_log_status_idx").on(t.status)]);

// ─────────────────────────────────────────────────────────────────────────────
// Étape 3 — catalogue produits : champs produit complets, catégories multiples,
// fournisseurs, packs, personnalisation, combinaisons.
// Les index sur `reference` et `ean13` retirés à l'étape 1 sont réintroduits ici,
// maintenant que les colonnes existent.
// ─────────────────────────────────────────────────────────────────────────────

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
}, (t) => [uniqueIndex("product_categories_unique").on(t.productId, t.categoryId), index("product_categories_category_idx").on(t.categoryId), uniqueIndex("product_categories_one_default").on(t.productId).where(sql`${t.isDefault} = true`)]);

export const productSuppliers = pgTable("product_suppliers", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  supplierReference: varchar("supplier_reference", { length: 80 }),
  purchasePriceXof: integer("purchase_price_xof"),
  currency: varchar("currency", { length: 3 }).notNull().default("XOF"),
  isDefault: boolean("is_default").notNull().default(false),
}, (t) => [uniqueIndex("product_suppliers_unique").on(t.productId, t.supplierId), index("product_suppliers_supplier_idx").on(t.supplierId)]);

export const productCarriers = pgTable("product_carriers", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  shippingMethodId: uuid("shipping_method_id").notNull().references(() => shippingMethods.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("product_carriers_unique").on(t.productId, t.shippingMethodId)]);

export const packItems = pgTable("pack_items", {
  id: serial("id").primaryKey(),
  packProductId: uuid("pack_product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  componentProductId: uuid("component_product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  componentVariantId: integer("component_variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull().default(1),
}, (t) => [uniqueIndex("pack_items_unique").on(t.packProductId, t.componentProductId, t.componentVariantId), index("pack_items_pack_idx").on(t.packProductId)]);

export const productCustomizations = pgTable("product_customizations", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 120 }).notNull(),
  type: customizationTypeEnum("type").notNull().default("text"),
  isRequired: boolean("is_required").notNull().default(false),
  maxChars: integer("max_chars"),
  maxBytes: integer("max_bytes"),
  position: integer("position").notNull().default(0),
}, (t) => [index("product_customizations_product_idx").on(t.productId, t.position)]);

export const productTags = pgTable("product_tags", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  tag: varchar("tag", { length: 60 }).notNull(),
}, (t) => [uniqueIndex("product_tags_unique").on(t.productId, t.tag), index("product_tags_tag_idx").on(t.tag)]);

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  reason: stockMovementReasonEnum("reason").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  quantityBefore: integer("quantity_before").notNull(),
  quantityAfter: integer("quantity_after").notNull(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  note: varchar("note", { length: 240 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("stock_movements_product_time_idx").on(t.productId, t.createdAt), index("stock_movements_variant_idx").on(t.variantId), index("stock_movements_reason_idx").on(t.reason, t.createdAt)]);
