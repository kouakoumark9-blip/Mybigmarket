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
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["buyer", "seller", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const verificationStatusEnum = pgEnum("verification_status", ["pending", "approved", "rejected", "suspended"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "pending_review", "approved", "rejected", "archived"]);
export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment", "paid_escrow", "seller_confirmed", "received_collection_point",
  "shipped", "arrived_abidjan", "out_for_delivery", "delivered", "seller_paid",
  "cancelled", "dispute", "refunded",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["orange_money", "mtn_momo", "wave", "card", "mock"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded", "cancelled"]);
export const escrowStatusEnum = pgEnum("escrow_status", ["blocked", "eligible", "release_pending", "released", "refund_pending", "refunded", "cancelled"]);
export const shipmentStatusEnum = pgEnum("shipment_status", ["draft", "collecting", "shipped", "arrived_abidjan", "closed", "cancelled"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "investigating", "resolved_buyer", "resolved_seller", "closed"]);
export const payoutStatusEnum = pgEnum("payout_status", ["requested", "approved", "processing", "paid", "rejected"]);
export const quoteRequestKindEnum = pgEnum("quote_request_kind", ["product", "sourcing"]);
export const quoteRequestStatusEnum = pgEnum("quote_request_status", ["new", "in_review", "quoted", "closed"]);

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
}, (t) => [uniqueIndex("users_email_unique").on(t.email), index("users_role_idx").on(t.role)]);

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
  parentId: integer("parent_id"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [uniqueIndex("categories_slug_unique").on(t.slug), index("categories_parent_idx").on(t.parentId)]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  categoryId: integer("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 190 }).notNull(),
  slug: varchar("slug", { length: 210 }).notNull(),
  description: text("description").notNull(),
  priceXof: integer("price_xof").notNull(),
  quantity: integer("quantity").notNull().default(0),
  minimumQuantity: integer("minimum_quantity").notNull().default(1),
  leadTimeDays: integer("lead_time_days").notNull().default(35),
  status: productStatusEnum("status").notNull().default("pending_review"),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("products_slug_unique").on(t.slug), index("products_seller_idx").on(t.sellerId), index("products_category_idx").on(t.categoryId), index("products_listing_idx").on(t.status, t.categoryId)]);

export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 190 }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)]);

export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  value: varchar("value", { length: 120 }).notNull(),
  priceDeltaXof: integer("price_delta_xof").notNull().default(0),
  stock: integer("stock").notNull().default(0),
}, (t) => [index("product_variants_product_idx").on(t.productId)]);

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
  status: orderStatusEnum("status").notNull().default("awaiting_payment"),
  deliveryAddress: jsonb("delivery_address").$type<Record<string, string> | null>(),
  deliveryMethod: varchar("delivery_method", { length: 20 }).notNull().default("delivery"),
  paymentExpiresAt: timestamp("payment_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("orders_buyer_idx").on(t.buyerId, t.createdAt), index("orders_status_idx").on(t.status), index("orders_shipment_idx").on(t.shipmentId)]);

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
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
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_conversation_time_idx").on(t.conversationId, t.createdAt), index("messages_sender_read_idx").on(t.senderId, t.readAt)]);

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
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPriceXof: integer("unit_price_xof").notNull(),
  productTitle: varchar("product_title", { length: 190 }).notNull(),
}, (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_seller_idx").on(t.sellerId)]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  amountXof: integer("amount_xof").notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  provider: varchar("provider", { length: 80 }).notNull().default("mock"),
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
  rating: integer("rating").notNull(),
  comment: text("comment"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reviews_order_product_buyer_unique").on(t.orderId, t.productId, t.buyerId), index("reviews_product_publish_idx").on(t.productId, t.isPublished)]);

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
}, (t) => [index("admin_audit_actor_time_idx").on(t.actorUserId, t.createdAt), index("admin_audit_entity_idx").on(t.entityType, t.entityId)]);

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
