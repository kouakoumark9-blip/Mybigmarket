-- Mybigmarket — application de toutes les migrations (19 fichiers)
-- Régénérer avec : npm run db:sql:all
-- Appliquer avec : psql "$DATABASE_URL" -f migrate-all.sql
--
-- Idempotent : une migration déjà appliquée est ignorée, via la même table de
-- suivi que drizzle-kit (drizzle.__drizzle_migrations), qu'elle ait été passée
-- par ce fichier ou par `npm run db:migrate`. Ne jamais modifier une migration
-- déjà passée : créer une nouvelle migration.

CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);


-- ============ 0000_careful_cassandra_nova.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0000_careful_cassandra_nova.sql:plain:60b5ca4178', '0e0f8be2cce87aaa25f27ab83f34c5d504cd47eb64ecbbe6097afa4bcd8cf362')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'investigating', 'resolved_buyer', 'resolved_seller', 'closed');
CREATE TYPE "public"."escrow_status" AS ENUM('blocked', 'eligible', 'release_pending', 'released', 'refund_pending', 'refunded', 'cancelled');
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'paid_escrow', 'seller_confirmed', 'received_collection_point', 'shipped', 'arrived_abidjan', 'out_for_delivery', 'delivered', 'seller_paid', 'cancelled', 'dispute', 'refunded');
CREATE TYPE "public"."payment_method" AS ENUM('orange_money', 'mtn_momo', 'wave', 'card', 'mock');
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded', 'cancelled');
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'approved', 'processing', 'paid', 'rejected');
CREATE TYPE "public"."product_status" AS ENUM('draft', 'pending_review', 'approved', 'rejected', 'archived');
CREATE TYPE "public"."shipment_status" AS ENUM('draft', 'collecting', 'shipped', 'arrived_abidjan', 'closed', 'cancelled');
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'seller', 'admin');
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'deleted');
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');
CREATE TABLE "admin_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(100),
	"details" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"parent_id" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"reason" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"decision" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "escrow_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_xof" integer NOT NULL,
	"commission_bps" integer DEFAULT 800 NOT NULL,
	"commission_xof" integer NOT NULL,
	"seller_net_xof" integer NOT NULL,
	"status" "escrow_status" DEFAULT 'blocked' NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_xof" integer NOT NULL,
	"product_title" varchar(190) NOT NULL
);
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"shipment_id" integer,
	"pickup_point_id" integer,
	"total_xof" integer NOT NULL,
	"status" "order_status" DEFAULT 'awaiting_payment' NOT NULL,
	"delivery_address" jsonb,
	"delivery_method" varchar(20) DEFAULT 'delivery' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_xof" integer NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"provider" varchar(80) DEFAULT 'mock' NOT NULL,
	"external_reference" varchar(190),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"amount_xof" integer NOT NULL,
	"method" varchar(40) NOT NULL,
	"destination_masked" varchar(120),
	"status" "payout_status" DEFAULT 'requested' NOT NULL,
	"external_reference" varchar(190),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "pickup_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"city" varchar(100) NOT NULL,
	"address" varchar(255) NOT NULL,
	"phone" varchar(40),
	"opening_hours" varchar(190),
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(190),
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"value" varchar(120) NOT NULL,
	"price_delta_xof" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"title" varchar(190) NOT NULL,
	"slug" varchar(210) NOT NULL,
	"description" text NOT NULL,
	"price_xof" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"minimum_quantity" integer DEFAULT 1 NOT NULL,
	"lead_time_days" integer DEFAULT 35 NOT NULL,
	"status" "product_status" DEFAULT 'pending_review' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "seller_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"university" varchar(190) NOT NULL,
	"city_china" varchar(120) NOT NULL,
	"whatsapp" varchar(32),
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_status" "verification_status" DEFAULT 'pending' NOT NULL,
	"rating_avg" numeric(3, 2) DEFAULT '0' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_ref" varchar(64) NOT NULL,
	"status" "shipment_status" DEFAULT 'draft' NOT NULL,
	"origin" varchar(120) DEFAULT 'Chine' NOT NULL,
	"destination" varchar(120) DEFAULT 'Abidjan' NOT NULL,
	"departed_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(190) NOT NULL,
	"phone" varchar(32),
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"balance_xof" integer DEFAULT 0 NOT NULL,
	"pending_xof" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "escrow_entries" ADD CONSTRAINT "escrow_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_point_id_pickup_points_id_fk" FOREIGN KEY ("pickup_point_id") REFERENCES "public"."pickup_points"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "admin_audit_actor_time_idx" ON "admin_audit_log" USING btree ("actor_user_id","created_at");
CREATE INDEX "admin_audit_entity_idx" ON "admin_audit_log" USING btree ("entity_type","entity_id");
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
CREATE INDEX "disputes_order_idx" ON "disputes" USING btree ("order_id");
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");
CREATE UNIQUE INDEX "escrow_order_unique" ON "escrow_entries" USING btree ("order_id");
CREATE INDEX "escrow_status_idx" ON "escrow_entries" USING btree ("status");
CREATE INDEX "order_events_order_time_idx" ON "order_events" USING btree ("order_id","created_at");
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");
CREATE INDEX "order_items_seller_idx" ON "order_items" USING btree ("seller_id");
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id","created_at");
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");
CREATE INDEX "orders_shipment_idx" ON "orders" USING btree ("shipment_id");
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" USING btree ("external_reference");
CREATE INDEX "payouts_seller_status_idx" ON "payouts" USING btree ("seller_id","status");
CREATE UNIQUE INDEX "pickup_points_name_city_unique" ON "pickup_points" USING btree ("name","city");
CREATE INDEX "pickup_points_city_active_idx" ON "pickup_points" USING btree ("city","is_active");
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","sort_order");
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");
CREATE INDEX "products_seller_idx" ON "products" USING btree ("seller_id");
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");
CREATE INDEX "products_listing_idx" ON "products" USING btree ("status","category_id");
CREATE UNIQUE INDEX "reviews_order_product_buyer_unique" ON "reviews" USING btree ("order_id","product_id","buyer_id");
CREATE INDEX "reviews_product_publish_idx" ON "reviews" USING btree ("product_id","is_published");
CREATE UNIQUE INDEX "seller_profiles_user_unique" ON "seller_profiles" USING btree ("user_id");
CREATE INDEX "seller_profiles_status_idx" ON "seller_profiles" USING btree ("verification_status");
CREATE UNIQUE INDEX "shipments_batch_ref_unique" ON "shipments" USING btree ("batch_ref");
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");
CREATE UNIQUE INDEX "wallets_seller_unique" ON "wallets" USING btree ("seller_id");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0000_careful_cassandra_nova.sql:plain:60b5ca4178', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0001_giant_rattler.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0001_giant_rattler.sql:plain:edbeaa20ce', '73e2eeb63b4dd93e8efa271e4997a5609ba4b38970b1b531abae6592807d1d67')) THEN
    EXECUTE $sql$
CREATE TABLE "platform_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(80) NOT NULL,
	"value" varchar(240) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "orders" ADD COLUMN "payment_expires_at" timestamp with time zone;
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "platform_settings_key_unique" ON "platform_settings" USING btree ("key");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0001_giant_rattler.sql:plain:edbeaa20ce', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0002_daffy_blindfold.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0002_daffy_blindfold.sql:plain:7f5ea457ba', 'aeffc8ca6feadc8e735c6e34bed7fcb0d81cb7749cf81ffbfc5458c7aa24072e')) THEN
    EXECUTE $sql$
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "conversations_buyer_seller_product_unique" ON "conversations" USING btree ("buyer_id","seller_id","product_id");
CREATE INDEX "conversations_buyer_recent_idx" ON "conversations" USING btree ("buyer_id","last_message_at");
CREATE INDEX "conversations_seller_recent_idx" ON "conversations" USING btree ("seller_id","last_message_at");
CREATE INDEX "messages_conversation_time_idx" ON "messages" USING btree ("conversation_id","created_at");
CREATE INDEX "messages_sender_read_idx" ON "messages" USING btree ("sender_id","read_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0002_daffy_blindfold.sql:plain:7f5ea457ba', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0003_overrated_speedball.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0003_overrated_speedball.sql:plain:d16529de4d', '242cb6a8d4a1e7dc18fa53292b90f8b5557b4c78fefe5d836f982d5eaba0b29d')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."quote_request_kind" AS ENUM('product', 'sourcing');
CREATE TYPE "public"."quote_request_status" AS ENUM('new', 'in_review', 'quoted', 'closed');
CREATE TABLE "quote_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid,
	"product_id" uuid,
	"conversation_id" uuid,
	"kind" "quote_request_kind" NOT NULL,
	"status" "quote_request_status" DEFAULT 'new' NOT NULL,
	"product_title" varchar(190) NOT NULL,
	"quantity" integer NOT NULL,
	"destination" varchar(120) NOT NULL,
	"contact_phone" varchar(32) NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "quote_requests_buyer_recent_idx" ON "quote_requests" USING btree ("buyer_id","created_at");
CREATE INDEX "quote_requests_seller_recent_idx" ON "quote_requests" USING btree ("seller_id","created_at");
CREATE INDEX "quote_requests_status_recent_idx" ON "quote_requests" USING btree ("status","created_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0003_overrated_speedball.sql:plain:d16529de4d', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0004_last_nighthawk.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0004_last_nighthawk.sql:plain:9b067e8bdf', 'dcd1bef938a48d4f76010ae3d9fd666aec38ac97df7be77f988c9b165e885afd')) THEN
    EXECUTE $sql$
CREATE TABLE "seller_storefronts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"slug" varchar(160) NOT NULL,
	"store_name" varchar(120) NOT NULL,
	"headline" varchar(190) DEFAULT 'Boutique partenaire mybigmarket' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"announcement" varchar(200),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "seller_storefronts" ADD CONSTRAINT "seller_storefronts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "seller_storefronts_seller_unique" ON "seller_storefronts" USING btree ("seller_id");
CREATE UNIQUE INDEX "seller_storefronts_slug_unique" ON "seller_storefronts" USING btree ("slug");
CREATE INDEX "seller_storefronts_published_idx" ON "seller_storefronts" USING btree ("is_published","updated_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0004_last_nighthawk.sql:plain:9b067e8bdf', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0005_damp_silver_samurai.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0005_damp_silver_samurai.sql:plain:c38b808401', '5e3f03f8f46bb9ade84aa8917a34a2658adba08316fd2833fb806fc911a5cc98')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."conversation_kind" AS ENUM('supplier', 'support', 'dispute');
CREATE TYPE "public"."employee_status" AS ENUM('active', 'invited', 'disabled', 'locked');
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'void');
CREATE TYPE "public"."message_author" AS ENUM('customer', 'supplier', 'employee');
CREATE TYPE "public"."review_subject" AS ENUM('product', 'supplier');
CREATE TYPE "public"."shipping_mode" AS ENUM('air', 'sea');
CREATE TYPE "public"."shipping_preference" AS ENUM('air_only', 'sea_only', 'both', 'automatic');
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0005_damp_silver_samurai.sql:plain:c38b808401', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0005_damp_silver_samurai.sql:alter-type-add-value:b5e9182219', '5e3f03f8f46bb9ade84aa8917a34a2658adba08316fd2833fb806fc911a5cc98')) THEN
    -- ALTER TYPE … ADD VALUE : commande utilitaire, via EXECUTE et seule
    -- dans sa transaction (contrainte PostgreSQL).
    EXECUTE $sql$
ALTER TYPE "public"."payment_method" ADD VALUE 'bank_transfer' BEFORE 'mock';
ALTER TYPE "public"."product_status" ADD VALUE 'published' BEFORE 'rejected';
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0005_damp_silver_samurai.sql:alter-type-add-value:b5e9182219', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0005_damp_silver_samurai.sql:plain:3c737e2f52', '5e3f03f8f46bb9ade84aa8917a34a2658adba08316fd2833fb806fc911a5cc98')) THEN
    EXECUTE $sql$
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" varchar(100),
	"before_state" jsonb,
	"after_state" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(120) NOT NULL,
	"label" varchar(140) NOT NULL,
	"resource" varchar(60) NOT NULL,
	"action" varchar(40) NOT NULL
);
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"image_url" text NOT NULL,
	"alt" varchar(190) NOT NULL,
	"target_url" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"guest_token_hash" varchar(128),
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"abandoned_at" timestamp with time zone,
	"converted_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "cms_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(160) NOT NULL,
	"title" varchar(190) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"meta_title" varchar(190),
	"meta_description" varchar(320),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"updated_by_employee_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"invoice_id" uuid,
	"credit_note_number" varchar(60) NOT NULL,
	"amount_xof" integer NOT NULL,
	"reason" text NOT NULL,
	"pdf_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" varchar(80) DEFAULT 'Adresse' NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"company_name" varchar(190),
	"phone" varchar(32) NOT NULL,
	"line_1" varchar(190) NOT NULL,
	"line_2" varchar(190),
	"city" varchar(120) NOT NULL,
	"region" varchar(120),
	"postal_code" varchar(24),
	"country_code" varchar(2) NOT NULL,
	"is_default_shipping" boolean DEFAULT false NOT NULL,
	"is_default_billing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "customer_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"discount_basis_points" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" varchar(190),
	"tax_number" varchar(80),
	"preferred_locale" varchar(16) DEFAULT 'fr-CI' NOT NULL,
	"preferred_currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"customer_group_id" integer,
	"customer_group" varchar(80) DEFAULT 'default' NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "employee_login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid,
	"email_attempted" varchar(190) NOT NULL,
	"succeeded" boolean NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"failure_reason" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "employee_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"email" varchar(190) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password_hash" text NOT NULL,
	"status" "employee_status" DEFAULT 'invited' NOT NULL,
	"totp_secret_encrypted" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"password_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"quote_currency" varchar(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"source" varchar(80) DEFAULT 'admin' NOT NULL,
	"is_indicative" boolean DEFAULT true NOT NULL,
	"updated_by_employee_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"quantity_delta" integer NOT NULL,
	"movement_type" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"reference" varchar(120),
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"invoice_number" varchar(60) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal_xof" integer NOT NULL,
	"shipping_xof" integer DEFAULT 0 NOT NULL,
	"tax_xof" integer DEFAULT 0 NOT NULL,
	"total_xof" integer NOT NULL,
	"pdf_url" text,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(48),
	"to_status" varchar(48) NOT NULL,
	"employee_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "order_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"label" varchar(100) NOT NULL,
	"color" varchar(7) DEFAULT '#64748b' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "payment_country_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"is_allowed" boolean DEFAULT false NOT NULL,
	"minimum_amount_xof" integer DEFAULT 0 NOT NULL,
	"maximum_amount_xof" integer
);
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"provider" varchar(80) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"supported_currencies" jsonb DEFAULT '["XOF"]'::jsonb NOT NULL,
	"mode" varchar(16) DEFAULT 'test' NOT NULL,
	"configuration_note" text DEFAULT 'Credentials belong in environment variables, never in this table.' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "product_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"file_name" varchar(190) NOT NULL,
	"url" text NOT NULL,
	"content_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "product_key_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"sort_order" integer NOT NULL
);
CREATE TABLE "product_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"keyword" varchar(160) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "lead_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"minimum_quantity" integer NOT NULL,
	"maximum_quantity" integer,
	"preparation_days" integer,
	"negotiable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "product_packaging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"units_per_sale" integer DEFAULT 1 NOT NULL,
	"length_cm" numeric(10, 2) DEFAULT '0' NOT NULL,
	"width_cm" numeric(10, 2) DEFAULT '0' NOT NULL,
	"height_cm" numeric(10, 2) DEFAULT '0' NOT NULL,
	"gross_weight_kg" numeric(10, 3) DEFAULT '0' NOT NULL,
	"shipping_preference" "shipping_preference" DEFAULT 'automatic' NOT NULL,
	"fragile" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "price_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"minimum_quantity" integer NOT NULL,
	"maximum_quantity" integer,
	"unit_price_xof" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"discount_type" varchar(16) NOT NULL,
	"discount_value" integer NOT NULL,
	"minimum_subtotal_xof" integer DEFAULT 0 NOT NULL,
	"maximum_discount_xof" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "related_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"related_product_id" uuid NOT NULL,
	"relation_type" varchar(32) DEFAULT 'related' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL
);
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"value" jsonb NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_by_employee_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "shipment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" integer NOT NULL,
	"order_id" uuid NOT NULL,
	"shipping_method_id" uuid,
	"mode" "shipping_mode",
	"quoted_cost_xof" integer,
	"tracking_number" varchar(120),
	"tracking_url" text,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone
);
CREATE TABLE "shipping_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"mode" "shipping_mode" NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sample_rates_only" boolean DEFAULT true NOT NULL,
	"volumetric_divisor" integer DEFAULT 6000 NOT NULL,
	"minimum_billable_weight_kg" numeric(10, 3) DEFAULT '0.5' NOT NULL,
	"maximum_recommended_weight_kg" numeric(10, 3) DEFAULT '150' NOT NULL,
	"sea_minimum_volume_m3" numeric(10, 4) DEFAULT '0.1' NOT NULL,
	"sea_recommendation_weight_kg" numeric(10, 3) DEFAULT '100' NOT NULL,
	"sea_recommendation_volume_m3" numeric(10, 4) DEFAULT '0.3' NOT NULL,
	"minimum_charge_xof" integer DEFAULT 0 NOT NULL,
	"insurance_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"customs_handling_xof" integer DEFAULT 0 NOT NULL,
	"fragile_surcharge_xof" integer DEFAULT 0 NOT NULL,
	"transit_days_min" integer NOT NULL,
	"transit_days_max" integer NOT NULL,
	"configuration_note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "shipping_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipping_method_id" uuid NOT NULL,
	"shipping_zone_id" uuid NOT NULL,
	"minimum_billable_units" numeric(12, 4) NOT NULL,
	"maximum_billable_units" numeric(12, 4),
	"rate_xof_per_unit" integer NOT NULL,
	"minimum_charge_xof" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"sample_only" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "shipping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipping_method_id" uuid NOT NULL,
	"shipping_zone_id" uuid,
	"code" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"country_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_path" varchar(300) NOT NULL,
	"new_path" varchar(300) NOT NULL,
	"product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" uuid,
	"company_name" varchar(190) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"city" varchar(120),
	"years_active" integer,
	"rating_average" numeric(3, 2),
	"review_count" integer DEFAULT 0 NOT NULL,
	"response_time_hours" numeric(8, 2),
	"on_time_delivery_percent" numeric(5, 2),
	"main_markets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile_status" varchar(24) DEFAULT 'unverified' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "tax_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"region" varchar(120),
	"label" varchar(120) NOT NULL,
	"rate_percent" numeric(7, 4) DEFAULT '0' NOT NULL,
	"is_included_in_price" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DROP INDEX "product_variants_product_idx";
DROP INDEX "reviews_product_publish_idx";
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;
ALTER TABLE "conversations" ADD COLUMN "kind" "conversation_kind" DEFAULT 'supplier' NOT NULL;
ALTER TABLE "conversations" ADD COLUMN "assigned_employee_id" uuid;
ALTER TABLE "messages" ADD COLUMN "sender_employee_id" uuid;
ALTER TABLE "messages" ADD COLUMN "author_type" "message_author" DEFAULT 'customer' NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "variant_id" integer;
ALTER TABLE "order_items" ADD COLUMN "applied_tier_minimum_quantity" integer DEFAULT 1 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "shipping_mode" "shipping_mode";
ALTER TABLE "order_items" ADD COLUMN "shipping_cost_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "variant_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "orders" ADD COLUMN "shipping_cost_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "shipping_mode" "shipping_mode";
ALTER TABLE "orders" ADD COLUMN "shipping_quote_snapshot" jsonb;
ALTER TABLE "payments" ADD COLUMN "provider_reference" varchar(190);
ALTER TABLE "payments" ADD COLUMN "country_code" varchar(2);
ALTER TABLE "payments" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "product_images" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "sku" varchar(80);
ALTER TABLE "product_variants" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "price_xof" integer;
ALTER TABLE "product_variants" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "image_url" text;
ALTER TABLE "product_variants" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "products" ADD COLUMN "supplier_id" uuid;
ALTER TABLE "products" ADD COLUMN "brand_id" integer;
ALTER TABLE "products" ADD COLUMN "sku" varchar(80);
ALTER TABLE "products" ADD COLUMN "short_description" varchar(320);
ALTER TABLE "products" ADD COLUMN "internal_note" text;
ALTER TABLE "products" ADD COLUMN "purchase_price_xof" integer;
ALTER TABLE "products" ADD COLUMN "seo_title" varchar(190);
ALTER TABLE "products" ADD COLUMN "seo_description" varchar(320);
ALTER TABLE "products" ADD COLUMN "open_graph_image_url" text;
ALTER TABLE "products" ADD COLUMN "canonical_path" varchar(300);
ALTER TABLE "products" ADD COLUMN "allow_reviews" boolean DEFAULT true NOT NULL;
ALTER TABLE "products" ADD COLUMN "published_at" timestamp with time zone;
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;
ALTER TABLE "reviews" ADD COLUMN "subject" "review_subject" DEFAULT 'product' NOT NULL;
ALTER TABLE "reviews" ADD COLUMN "supplier_id" uuid;
ALTER TABLE "reviews" ADD COLUMN "verified_purchase" boolean DEFAULT false NOT NULL;
ALTER TABLE "reviews" ADD COLUMN "moderated_by_employee_id" uuid;
ALTER TABLE "reviews" ADD COLUMN "moderated_at" timestamp with time zone;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "employee_login_events" ADD CONSTRAINT "employee_login_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "employee_sessions" ADD CONSTRAINT "employee_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_country_rules" ADD CONSTRAINT "payment_country_rules_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_attachments" ADD CONSTRAINT "product_attachments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_attachments" ADD CONSTRAINT "product_attachments_uploaded_by_employee_id_employees_id_fk" FOREIGN KEY ("uploaded_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_key_attributes" ADD CONSTRAINT "product_key_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_key_attributes" ADD CONSTRAINT "product_key_attributes_attribute_id_product_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_keywords" ADD CONSTRAINT "product_keywords_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lead_times" ADD CONSTRAINT "lead_times_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_related_product_id_products_id_fk" FOREIGN KEY ("related_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "slug_redirects" ADD CONSTRAINT "slug_redirects_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "activity_logs_actor_time_idx" ON "activity_logs" USING btree ("employee_id","created_at");
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");
CREATE UNIQUE INDEX "permissions_code_unique" ON "permissions" USING btree ("code");
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource","action");
CREATE UNIQUE INDEX "roles_code_unique" ON "roles" USING btree ("code");
CREATE INDEX "banners_active_order_idx" ON "banners" USING btree ("is_active","sort_order");
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" USING btree ("slug");
CREATE UNIQUE INDEX "brands_name_unique" ON "brands" USING btree ("name");
CREATE UNIQUE INDEX "cart_items_product_without_variant_unique" ON "cart_items" USING btree ("cart_id","product_id") WHERE "cart_items"."variant_id" IS NULL;
CREATE UNIQUE INDEX "cart_items_product_variant_unique" ON "cart_items" USING btree ("cart_id","product_id","variant_id") WHERE "cart_items"."variant_id" IS NOT NULL;
CREATE INDEX "cart_items_product_idx" ON "cart_items" USING btree ("product_id");
CREATE UNIQUE INDEX "carts_guest_token_unique" ON "carts" USING btree ("guest_token_hash");
CREATE INDEX "carts_customer_status_idx" ON "carts" USING btree ("customer_id","status");
CREATE INDEX "carts_abandoned_idx" ON "carts" USING btree ("status","abandoned_at");
CREATE UNIQUE INDEX "cms_pages_slug_unique" ON "cms_pages" USING btree ("slug");
CREATE INDEX "cms_pages_status_idx" ON "cms_pages" USING btree ("status");
CREATE UNIQUE INDEX "credit_notes_number_unique" ON "credit_notes" USING btree ("credit_note_number");
CREATE INDEX "credit_notes_order_idx" ON "credit_notes" USING btree ("order_id");
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");
CREATE INDEX "addresses_country_city_idx" ON "addresses" USING btree ("country_code","city");
CREATE UNIQUE INDEX "customer_groups_code_unique" ON "customer_groups" USING btree ("code");
CREATE INDEX "customer_groups_active_idx" ON "customer_groups" USING btree ("is_active");
CREATE UNIQUE INDEX "customers_user_unique" ON "customers" USING btree ("user_id");
CREATE INDEX "customers_group_idx" ON "customers" USING btree ("customer_group");
CREATE INDEX "employee_login_email_time_idx" ON "employee_login_events" USING btree ("email_attempted","created_at");
CREATE INDEX "employee_login_ip_time_idx" ON "employee_login_events" USING btree ("ip_address","created_at");
CREATE UNIQUE INDEX "employee_sessions_token_hash_unique" ON "employee_sessions" USING btree ("token_hash");
CREATE INDEX "employee_sessions_employee_active_idx" ON "employee_sessions" USING btree ("employee_id","expires_at");
CREATE UNIQUE INDEX "employees_email_unique" ON "employees" USING btree ("email");
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");
CREATE INDEX "employees_role_idx" ON "employees" USING btree ("role_id");
CREATE UNIQUE INDEX "exchange_rates_currency_pair_unique" ON "exchange_rates" USING btree ("base_currency","quote_currency");
CREATE INDEX "exchange_rates_updated_idx" ON "exchange_rates" USING btree ("updated_at");
CREATE INDEX "inventory_movements_product_time_idx" ON "inventory_movements" USING btree ("product_id","created_at");
CREATE INDEX "inventory_movements_variant_time_idx" ON "inventory_movements" USING btree ("variant_id","created_at");
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("invoice_number");
CREATE UNIQUE INDEX "invoices_order_unique" ON "invoices" USING btree ("order_id");
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");
CREATE INDEX "order_status_history_order_time_idx" ON "order_status_history" USING btree ("order_id","created_at");
CREATE INDEX "order_status_history_employee_idx" ON "order_status_history" USING btree ("employee_id");
CREATE UNIQUE INDEX "order_statuses_code_unique" ON "order_statuses" USING btree ("code");
CREATE INDEX "order_statuses_active_order_idx" ON "order_statuses" USING btree ("is_active","sort_order");
CREATE UNIQUE INDEX "payment_country_rules_method_country_unique" ON "payment_country_rules" USING btree ("payment_method_id","country_code");
CREATE INDEX "payment_country_rules_country_idx" ON "payment_country_rules" USING btree ("country_code","is_allowed");
CREATE UNIQUE INDEX "payment_methods_code_unique" ON "payment_methods" USING btree ("code");
CREATE INDEX "payment_methods_active_idx" ON "payment_methods" USING btree ("is_active");
CREATE INDEX "product_attachments_product_idx" ON "product_attachments" USING btree ("product_id","created_at");
CREATE INDEX "product_attributes_product_idx" ON "product_attributes" USING btree ("product_id","sort_order");
CREATE INDEX "product_attributes_name_idx" ON "product_attributes" USING btree ("name");
CREATE UNIQUE INDEX "product_key_attributes_product_order_unique" ON "product_key_attributes" USING btree ("product_id","sort_order");
CREATE UNIQUE INDEX "product_key_attributes_attribute_unique" ON "product_key_attributes" USING btree ("product_id","attribute_id");
CREATE UNIQUE INDEX "product_keywords_product_keyword_unique" ON "product_keywords" USING btree ("product_id","keyword");
CREATE INDEX "product_keywords_keyword_idx" ON "product_keywords" USING btree ("keyword");
CREATE INDEX "lead_times_product_order_idx" ON "lead_times" USING btree ("product_id","sort_order");
CREATE UNIQUE INDEX "product_packaging_product_unique" ON "product_packaging" USING btree ("product_id");
CREATE UNIQUE INDEX "price_tiers_default_variant_min_unique" ON "price_tiers" USING btree ("product_id","minimum_quantity") WHERE "price_tiers"."variant_id" IS NULL;
CREATE UNIQUE INDEX "price_tiers_specific_variant_min_unique" ON "price_tiers" USING btree ("product_id","variant_id","minimum_quantity") WHERE "price_tiers"."variant_id" IS NOT NULL;
CREATE INDEX "price_tiers_product_qty_idx" ON "price_tiers" USING btree ("product_id","minimum_quantity");
CREATE UNIQUE INDEX "promo_codes_code_unique" ON "promo_codes" USING btree ("code");
CREATE INDEX "promo_codes_active_period_idx" ON "promo_codes" USING btree ("is_active","starts_at","ends_at");
CREATE UNIQUE INDEX "related_products_pair_type_unique" ON "related_products" USING btree ("product_id","related_product_id","relation_type");
CREATE INDEX "related_products_product_order_idx" ON "related_products" USING btree ("product_id","relation_type","sort_order");
CREATE UNIQUE INDEX "role_permissions_pair_unique" ON "role_permissions" USING btree ("role_id","permission_id");
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");
CREATE UNIQUE INDEX "settings_key_unique" ON "settings" USING btree ("key");
CREATE UNIQUE INDEX "shipment_orders_order_unique" ON "shipment_orders" USING btree ("order_id");
CREATE INDEX "shipment_orders_shipment_idx" ON "shipment_orders" USING btree ("shipment_id");
CREATE UNIQUE INDEX "shipping_methods_code_unique" ON "shipping_methods" USING btree ("code");
CREATE INDEX "shipping_methods_active_mode_idx" ON "shipping_methods" USING btree ("is_active","mode");
CREATE INDEX "shipping_rates_lookup_idx" ON "shipping_rates" USING btree ("shipping_method_id","shipping_zone_id","sort_order");
CREATE UNIQUE INDEX "shipping_rules_global_method_code_unique" ON "shipping_rules" USING btree ("shipping_method_id","code") WHERE "shipping_rules"."shipping_zone_id" IS NULL;
CREATE UNIQUE INDEX "shipping_rules_zoned_method_code_unique" ON "shipping_rules" USING btree ("shipping_method_id","shipping_zone_id","code") WHERE "shipping_rules"."shipping_zone_id" IS NOT NULL;
CREATE INDEX "shipping_rules_method_priority_idx" ON "shipping_rules" USING btree ("shipping_method_id","is_enabled","priority");
CREATE UNIQUE INDEX "shipping_zones_code_unique" ON "shipping_zones" USING btree ("code");
CREATE INDEX "shipping_zones_active_order_idx" ON "shipping_zones" USING btree ("is_active","sort_order");
CREATE UNIQUE INDEX "slug_redirects_old_path_unique" ON "slug_redirects" USING btree ("old_path");
CREATE INDEX "slug_redirects_product_idx" ON "slug_redirects" USING btree ("product_id");
CREATE UNIQUE INDEX "suppliers_slug_unique" ON "suppliers" USING btree ("slug");
CREATE INDEX "suppliers_country_active_idx" ON "suppliers" USING btree ("country_code","is_active");
CREATE INDEX "suppliers_user_idx" ON "suppliers" USING btree ("seller_user_id");
CREATE UNIQUE INDEX "tax_rules_code_country_region_unique" ON "tax_rules" USING btree ("code","country_code","region");
CREATE INDEX "tax_rules_country_active_idx" ON "tax_rules" USING btree ("country_code","is_active");
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_employee_id_employees_id_fk" FOREIGN KEY ("sender_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_employee_id_employees_id_fk" FOREIGN KEY ("moderated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "messages_employee_idx" ON "messages" USING btree ("sender_employee_id","created_at");
CREATE UNIQUE INDEX "product_images_one_primary_unique" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" = true;
CREATE UNIQUE INDEX "product_variants_product_name_value_unique" ON "product_variants" USING btree ("product_id","name","value");
CREATE UNIQUE INDEX "product_variants_sku_unique" ON "product_variants" USING btree ("sku");
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");
CREATE INDEX "products_supplier_idx" ON "products" USING btree ("supplier_id");
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");
CREATE INDEX "reviews_supplier_publish_idx" ON "reviews" USING btree ("supplier_id","is_published","verified_purchase");
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id","is_active");
CREATE INDEX "reviews_product_publish_idx" ON "reviews" USING btree ("product_id","is_published","verified_purchase");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0005_damp_silver_samurai.sql:plain:3c737e2f52', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0006_gorgeous_namora.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0006_gorgeous_namora.sql:plain:d81a1a83eb', '86348833ea062d52f0432e6212dd82c37a2bc6819c5b3e17ed5cef2a62f60a9f')) THEN
    EXECUTE $sql$
CREATE TABLE "employee_security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "employee_security_events" ADD CONSTRAINT "employee_security_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "employee_security_events_employee_time_idx" ON "employee_security_events" USING btree ("employee_id","created_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0006_gorgeous_namora.sql:plain:d81a1a83eb', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0007_sticky_gamora.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0007_sticky_gamora.sql:plain:2d61dd9837', '74b380043fb42a6803f6a18d74aefdbb673e6a9c8fc6e0b4db0e897a44832016')) THEN
    EXECUTE $sql$
CREATE TABLE "employee_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_employee_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(100),
	"details" jsonb,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "employee_audit_logs" ADD CONSTRAINT "employee_audit_logs_actor_employee_id_employees_id_fk" FOREIGN KEY ("actor_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "employee_audit_actor_time_idx" ON "employee_audit_logs" USING btree ("actor_employee_id","created_at");
CREATE INDEX "employee_audit_entity_idx" ON "employee_audit_logs" USING btree ("entity_type","entity_id");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0007_sticky_gamora.sql:plain:2d61dd9837', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0008_brief_johnny_blaze.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0008_brief_johnny_blaze.sql:plain:e538e1748b', '7c4222fe4da9dad23c7b99643897db6611a15d757f9c1a7b11467b79cf53e32e')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."attribute_display_type" AS ENUM('color', 'texture', 'select', 'radio');
CREATE TYPE "public"."module_hook_status" AS ENUM('idle', 'ok', 'error');
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(120) NOT NULL,
	"key_prefix" varchar(12) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_ips" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "attribute_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"display_type" "attribute_display_type" DEFAULT 'select' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"color_hex" varchar(7),
	"texture_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "feature_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"value" varchar(190) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "hooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "module_events_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"hook_code" varchar(80) NOT NULL,
	"module_code" varchar(60) NOT NULL,
	"status" "module_hook_status" DEFAULT 'ok' NOT NULL,
	"payload_hash" varchar(64),
	"error" text,
	"duration_ms" integer,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "module_hooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"hook_code" varchar(80) NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "product_combination_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"attribute_value_id" uuid NOT NULL
);
CREATE TABLE "product_feature_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"feature_value_id" uuid,
	"custom_value" varchar(190)
);
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" varchar(40) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"field" varchar(40) NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "admin_audit_log" ADD COLUMN "before_state" jsonb;
ALTER TABLE "admin_audit_log" ADD COLUMN "after_state" jsonb;
ALTER TABLE "admin_audit_log" ADD COLUMN "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "brands" ADD COLUMN "description" text;
ALTER TABLE "brands" ADD COLUMN "meta_title" varchar(190);
ALTER TABLE "brands" ADD COLUMN "meta_description" varchar(320);
ALTER TABLE "brands" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "categories" ADD COLUMN "image_url" text;
ALTER TABLE "categories" ADD COLUMN "banner_url" text;
ALTER TABLE "categories" ADD COLUMN "meta_title" varchar(190);
ALTER TABLE "categories" ADD COLUMN "meta_description" varchar(320);
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "cms_pages" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "product_variants" ADD COLUMN "ean13" varchar(13);
ALTER TABLE "product_variants" ADD COLUMN "upc" varchar(12);
ALTER TABLE "product_variants" ADD COLUMN "weight_impact_grams" integer DEFAULT 0 NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "minimum_quantity" integer;
ALTER TABLE "product_variants" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
ALTER TABLE "product_variants" ADD COLUMN "combination_key" varchar(64);
ALTER TABLE "product_variants" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE "suppliers" ADD COLUMN "logo_url" text;
ALTER TABLE "suppliers" ADD COLUMN "description" text;
ALTER TABLE "suppliers" ADD COLUMN "contact_email" varchar(190);
ALTER TABLE "suppliers" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_group_id_attribute_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."attribute_groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "feature_values" ADD CONSTRAINT "feature_values_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "module_hooks" ADD CONSTRAINT "module_hooks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;
-- PostgreSQL exige l'index unique AVANT la clé étrangère qui le vise.
CREATE UNIQUE INDEX "hooks_code_unique" ON "hooks" USING btree ("code");
ALTER TABLE "module_hooks" ADD CONSTRAINT "module_hooks_hook_code_hooks_code_fk" FOREIGN KEY ("hook_code") REFERENCES "public"."hooks"("code") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "product_combination_attributes" ADD CONSTRAINT "product_combination_attributes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_combination_attributes" ADD CONSTRAINT "product_combination_attributes_attribute_value_id_attribute_values_id_fk" FOREIGN KEY ("attribute_value_id") REFERENCES "public"."attribute_values"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "product_feature_values" ADD CONSTRAINT "product_feature_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_feature_values" ADD CONSTRAINT "product_feature_values_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_feature_values" ADD CONSTRAINT "product_feature_values_feature_value_id_feature_values_id_fk" FOREIGN KEY ("feature_value_id") REFERENCES "public"."feature_values"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "api_keys_hash_unique" ON "api_keys" USING btree ("key_hash");
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");
CREATE INDEX "api_keys_active_idx" ON "api_keys" USING btree ("is_active");
CREATE UNIQUE INDEX "attribute_groups_code_unique" ON "attribute_groups" USING btree ("code");
CREATE INDEX "attribute_groups_active_position_idx" ON "attribute_groups" USING btree ("is_active","position");
CREATE UNIQUE INDEX "attribute_values_group_code_unique" ON "attribute_values" USING btree ("group_id","code");
CREATE INDEX "attribute_values_group_position_idx" ON "attribute_values" USING btree ("group_id","position");
CREATE UNIQUE INDEX "feature_values_feature_value_unique" ON "feature_values" USING btree ("feature_id","value");
CREATE INDEX "feature_values_feature_position_idx" ON "feature_values" USING btree ("feature_id","position");
CREATE UNIQUE INDEX "features_code_unique" ON "features" USING btree ("code");
CREATE INDEX "features_active_position_idx" ON "features" USING btree ("is_active","position");
CREATE INDEX "module_events_log_hook_idx" ON "module_events_log" USING btree ("hook_code","executed_at");
CREATE INDEX "module_events_log_module_idx" ON "module_events_log" USING btree ("module_code","executed_at");
CREATE UNIQUE INDEX "module_hooks_unique" ON "module_hooks" USING btree ("module_id","hook_code");
CREATE INDEX "module_hooks_lookup_idx" ON "module_hooks" USING btree ("hook_code","is_active","priority");
CREATE UNIQUE INDEX "modules_code_unique" ON "modules" USING btree ("code");
CREATE INDEX "modules_active_idx" ON "modules" USING btree ("is_active");
CREATE UNIQUE INDEX "product_combination_attributes_unique" ON "product_combination_attributes" USING btree ("variant_id","attribute_value_id");
CREATE INDEX "product_combination_attributes_value_idx" ON "product_combination_attributes" USING btree ("attribute_value_id");
CREATE UNIQUE INDEX "product_feature_values_unique" ON "product_feature_values" USING btree ("product_id","feature_id");
CREATE INDEX "product_feature_values_feature_idx" ON "product_feature_values" USING btree ("feature_id","feature_value_id");
CREATE UNIQUE INDEX "translations_unique" ON "translations" USING btree ("entity","entity_id","locale","field");
CREATE INDEX "translations_lookup_idx" ON "translations" USING btree ("entity","entity_id","locale");
CREATE INDEX "products_trash_idx" ON "products" USING btree ("deleted_at","status");
CREATE INDEX "products_position_idx" ON "products" USING btree ("position");
CREATE INDEX "categories_trash_idx" ON "categories" USING btree ("deleted_at","is_active");
CREATE INDEX "brands_trash_idx" ON "brands" USING btree ("deleted_at");
CREATE INDEX "suppliers_trash_idx" ON "suppliers" USING btree ("deleted_at");
CREATE INDEX "users_trash_idx" ON "users" USING btree ("deleted_at","status");
CREATE INDEX "orders_reference_idx" ON "orders" USING btree ("status","created_at");
CREATE INDEX "orders_trash_idx" ON "orders" USING btree ("deleted_at");
CREATE UNIQUE INDEX "product_variants_combination_key_idx" ON "product_variants" USING btree ("product_id","combination_key") WHERE "combination_key" IS NOT NULL;
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0008_brief_johnny_blaze.sql:plain:e538e1748b', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0009_exotic_runaways.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0009_exotic_runaways.sql:plain:57b49779aa', 'a320f61db3cc404a00f139b2a08be72fdc1a0bf64e4d82574f8b4535df267d4c')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."address_format_hint" AS ENUM('standard', 'postal_then_city', 'city_then_postal', 'no_postal');
CREATE TYPE "public"."email_queue_status" AS ENUM('pending', 'sending', 'sent', 'failed');
CREATE TYPE "public"."email_template_status" AS ENUM('draft', 'active', 'archived');
CREATE TABLE "countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"iso2" varchar(2) NOT NULL,
	"iso3" varchar(3) NOT NULL,
	"name" varchar(120) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"calling_code" varchar(8),
	"shipping_zone_id" uuid,
	"need_zip_code" boolean DEFAULT true NOT NULL,
	"zip_code_format" varchar(40),
	"address_format" "address_format_hint" DEFAULT 'standard' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "currencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(3) NOT NULL,
	"name" varchar(80) NOT NULL,
	"symbol" varchar(8) NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"symbol_position" varchar(10) DEFAULT 'after' NOT NULL,
	"conversion_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"queue_id" uuid,
	"to_address" varchar(190) NOT NULL,
	"subject" varchar(240) NOT NULL,
	"provider" varchar(40) DEFAULT 'smtp' NOT NULL,
	"status" varchar(24) NOT NULL,
	"error" text,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "email_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" varchar(190) NOT NULL,
	"template_code" varchar(60),
	"subject" varchar(240) NOT NULL,
	"body_html" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "email_queue_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"locale" varchar(5) DEFAULT 'fr' NOT NULL,
	"name" varchar(160) NOT NULL,
	"subject" varchar(240) NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "email_template_status" DEFAULT 'draft' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by_employee_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "languages" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(5) NOT NULL,
	"name" varchar(60) NOT NULL,
	"locale" varchar(10) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "states" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"iso_code" varchar(8),
	"shipping_zone_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL
);
CREATE TABLE "tax_rule_group_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_rule_group_id" uuid NOT NULL,
	"tax_rule_id" uuid NOT NULL,
	"country_code" varchar(2),
	"priority" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "tax_rule_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
ALTER TABLE "products" ADD COLUMN "tax_rule_group_id" uuid;
ALTER TABLE "countries" ADD CONSTRAINT "countries_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_queue_id_email_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."email_queue"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "states" ADD CONSTRAINT "states_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "tax_rule_group_rules" ADD CONSTRAINT "tax_rule_group_rules_tax_rule_group_id_tax_rule_groups_id_fk" FOREIGN KEY ("tax_rule_group_id") REFERENCES "public"."tax_rule_groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tax_rule_group_rules" ADD CONSTRAINT "tax_rule_group_rules_tax_rule_id_tax_rules_id_fk" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."tax_rules"("id") ON DELETE cascade ON UPDATE no action;
CREATE UNIQUE INDEX "countries_iso2_unique" ON "countries" USING btree ("iso2");
CREATE INDEX "countries_active_position_idx" ON "countries" USING btree ("is_active","position");
CREATE INDEX "countries_zone_idx" ON "countries" USING btree ("shipping_zone_id");
CREATE UNIQUE INDEX "currencies_code_unique" ON "currencies" USING btree ("code");
CREATE INDEX "currencies_default_idx" ON "currencies" USING btree ("is_default");
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("created_at");
CREATE INDEX "email_log_status_idx" ON "email_log" USING btree ("status");
CREATE INDEX "email_queue_status_schedule_idx" ON "email_queue" USING btree ("status","scheduled_at");
CREATE INDEX "email_queue_created_idx" ON "email_queue" USING btree ("created_at");
CREATE UNIQUE INDEX "email_templates_code_locale_unique" ON "email_templates" USING btree ("code","locale");
CREATE INDEX "email_templates_active_idx" ON "email_templates" USING btree ("is_active","code");
CREATE UNIQUE INDEX "languages_code_unique" ON "languages" USING btree ("code");
CREATE UNIQUE INDEX "states_country_name_unique" ON "states" USING btree ("country_id","name");
CREATE INDEX "states_country_active_idx" ON "states" USING btree ("country_id","is_active");
CREATE INDEX "tax_rule_group_rules_group_idx" ON "tax_rule_group_rules" USING btree ("tax_rule_group_id","country_code");
CREATE INDEX "tax_rule_group_rules_rule_idx" ON "tax_rule_group_rules" USING btree ("tax_rule_id");
CREATE UNIQUE INDEX "tax_rule_groups_name_unique" ON "tax_rule_groups" USING btree ("name");
CREATE INDEX "tax_rule_groups_active_idx" ON "tax_rule_groups" USING btree ("is_active");
ALTER TABLE "products" ADD CONSTRAINT "products_tax_rule_group_id_tax_rule_groups_id_fk" FOREIGN KEY ("tax_rule_group_id") REFERENCES "public"."tax_rule_groups"("id") ON DELETE set null ON UPDATE no action;
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0009_exotic_runaways.sql:plain:57b49779aa', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0010_clear_madame_hydra.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0010_clear_madame_hydra.sql:plain:377f45d2c3', '612bb4b9babe3fb7b1b9a7010a9964cc52a5fc71734a35705d14790ef5e68121')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."customization_type" AS ENUM('text', 'file');
CREATE TYPE "public"."out_of_stock_behavior" AS ENUM('refuse', 'backorder', 'use_default');
CREATE TYPE "public"."product_condition" AS ENUM('new', 'used', 'refurbished');
CREATE TYPE "public"."product_type" AS ENUM('standard', 'pack', 'virtual');
CREATE TYPE "public"."product_visibility" AS ENUM('everywhere', 'catalog', 'search', 'nowhere');
CREATE TYPE "public"."redirect_target_type" AS ENUM('category', 'product', 'url');
CREATE TYPE "public"."redirect_type" AS ENUM('301', '302');
CREATE TYPE "public"."stock_movement_reason" AS ENUM('purchase', 'sale', 'return', 'adjustment', 'loss', 'restock', 'pack', 'cancellation');
CREATE TABLE "pack_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"component_variant_id" integer,
	"quantity" integer DEFAULT 1 NOT NULL
);
CREATE TABLE "product_carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"shipping_method_id" uuid NOT NULL
);
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
CREATE TABLE "product_customizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"label" varchar(120) NOT NULL,
	"type" "customization_type" DEFAULT 'text' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"max_chars" integer,
	"max_bytes" integer,
	"position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "product_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_reference" varchar(80),
	"purchase_price_xof" integer,
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
CREATE TABLE "product_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"tag" varchar(60) NOT NULL
);
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"reason" "stock_movement_reason" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"order_id" uuid,
	"employee_id" uuid,
	"note" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "product_variants" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "reference" varchar(64);
ALTER TABLE "products" ADD COLUMN "product_type" "product_type" DEFAULT 'standard' NOT NULL;
ALTER TABLE "products" ADD COLUMN "ean13" varchar(13);
ALTER TABLE "products" ADD COLUMN "upc" varchar(12);
ALTER TABLE "products" ADD COLUMN "isbn" varchar(17);
ALTER TABLE "products" ADD COLUMN "mpn" varchar(40);
ALTER TABLE "products" ADD COLUMN "condition" "product_condition" DEFAULT 'new' NOT NULL;
ALTER TABLE "products" ADD COLUMN "visibility" "product_visibility" DEFAULT 'everywhere' NOT NULL;
ALTER TABLE "products" ADD COLUMN "available_for_order" boolean DEFAULT true NOT NULL;
ALTER TABLE "products" ADD COLUMN "show_price" boolean DEFAULT true NOT NULL;
ALTER TABLE "products" ADD COLUMN "out_of_stock_behavior" "out_of_stock_behavior" DEFAULT 'use_default' NOT NULL;
ALTER TABLE "products" ADD COLUMN "restock_date" timestamp with time zone;
ALTER TABLE "products" ADD COLUMN "in_stock_message" varchar(120);
ALTER TABLE "products" ADD COLUMN "out_of_stock_message" varchar(120);
ALTER TABLE "products" ADD COLUMN "ecotax_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "unit_price_xof" integer;
ALTER TABLE "products" ADD COLUMN "unit_label" varchar(20);
ALTER TABLE "products" ADD COLUMN "weight_grams" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "length_mm" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "width_mm" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "height_mm" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "additional_shipping_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "products" ADD COLUMN "delivery_time_days" integer;
ALTER TABLE "products" ADD COLUMN "redirect_type" "redirect_type";
ALTER TABLE "products" ADD COLUMN "redirect_target_type" "redirect_target_type";
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_pack_product_id_products_id_fk" FOREIGN KEY ("pack_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "product_carriers" ADD CONSTRAINT "product_carriers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_carriers" ADD CONSTRAINT "product_carriers_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_customizations" ADD CONSTRAINT "product_customizations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "pack_items_unique" ON "pack_items" USING btree ("pack_product_id","component_product_id","component_variant_id");
CREATE INDEX "pack_items_pack_idx" ON "pack_items" USING btree ("pack_product_id");
CREATE UNIQUE INDEX "product_carriers_unique" ON "product_carriers" USING btree ("product_id","shipping_method_id");
CREATE UNIQUE INDEX "product_categories_unique" ON "product_categories" USING btree ("product_id","category_id");
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id");
CREATE UNIQUE INDEX "product_categories_one_default" ON "product_categories" USING btree ("product_id") WHERE "product_categories"."is_default" = true;
CREATE INDEX "product_customizations_product_idx" ON "product_customizations" USING btree ("product_id","position");
CREATE UNIQUE INDEX "product_suppliers_unique" ON "product_suppliers" USING btree ("product_id","supplier_id");
CREATE INDEX "product_suppliers_supplier_idx" ON "product_suppliers" USING btree ("supplier_id");
CREATE UNIQUE INDEX "product_tags_unique" ON "product_tags" USING btree ("product_id","tag");
CREATE INDEX "product_tags_tag_idx" ON "product_tags" USING btree ("tag");
CREATE INDEX "stock_movements_product_time_idx" ON "stock_movements" USING btree ("product_id","created_at");
CREATE INDEX "stock_movements_variant_idx" ON "stock_movements" USING btree ("variant_id");
CREATE INDEX "stock_movements_reason_idx" ON "stock_movements" USING btree ("reason","created_at");
CREATE UNIQUE INDEX "products_reference_unique" ON "products" USING btree ("reference") WHERE "products"."deleted_at" IS NULL AND "products"."reference" IS NOT NULL;
CREATE INDEX "products_ean13_idx" ON "products" USING btree ("ean13");
CREATE INDEX "products_type_idx" ON "products" USING btree ("product_type","deleted_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0010_clear_madame_hydra.sql:plain:377f45d2c3', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0011_little_warstar.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0011_little_warstar.sql:plain:ed1d4d9660', 'ce7bfab5cd6b97f459f6b25bd34b619c4fbfd3bb3f1e79df62ab2344a9a51eff')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."billable_basis" AS ENUM('weight', 'volume', 'both');
CREATE TYPE "public"."transit_unit" AS ENUM('days', 'weeks');
CREATE TABLE "shipping_discount_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipping_method_id" uuid NOT NULL,
	"shipping_zone_id" uuid,
	"minimum_billable_units" numeric(12, 4) DEFAULT '0' NOT NULL,
	"discount_percent" numeric(5, 2) NOT NULL,
	"label" varchar(120) DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_fingerprint" varchar(64) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"region_code" varchar(40),
	"subtotal_xof" integer DEFAULT 0 NOT NULL,
	"total_weight_grams" integer DEFAULT 0 NOT NULL,
	"total_volume_cm3" bigint DEFAULT 0 NOT NULL,
	"request_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"option_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "shipping_methods" ADD COLUMN "billable_basis" "billable_basis" DEFAULT 'both' NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "free_above_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "free_above_weight_grams" integer DEFAULT 0 NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "out_of_range_behavior" varchar(20) DEFAULT 'disable' NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "max_package_weight_grams" integer DEFAULT 30000 NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "max_package_length_cm" integer DEFAULT 150 NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "delivery_time_label" varchar(120) DEFAULT '' NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "tracking_url_pattern" varchar(255) DEFAULT '' NOT NULL;
ALTER TABLE "shipping_methods" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "shipping_methods" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "shipping_rates" ADD COLUMN "label" varchar(120) DEFAULT '' NOT NULL;
ALTER TABLE "shipping_rates" ADD COLUMN "handling_fee_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "shipping_rates" ADD COLUMN "customs_fee_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "shipping_rates" ADD COLUMN "transit_days_min" integer;
ALTER TABLE "shipping_rates" ADD COLUMN "transit_days_max" integer;
ALTER TABLE "shipping_rates" ADD COLUMN "valid_from" timestamp with time zone;
ALTER TABLE "shipping_rates" ADD COLUMN "valid_to" timestamp with time zone;
ALTER TABLE "shipping_rates" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "shipping_rates" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "shipping_zones" ADD COLUMN "region_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "shipping_zones" ADD COLUMN "city_names" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "shipping_zones" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
ALTER TABLE "shipping_zones" ADD COLUMN "notes" text DEFAULT '' NOT NULL;
ALTER TABLE "shipping_zones" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "shipping_discount_tiers" ADD CONSTRAINT "shipping_discount_tiers_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shipping_discount_tiers" ADD CONSTRAINT "shipping_discount_tiers_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "shipping_discount_tiers_lookup_idx" ON "shipping_discount_tiers" USING btree ("shipping_method_id","shipping_zone_id","sort_order");
CREATE INDEX "shipping_quotes_fingerprint_idx" ON "shipping_quotes" USING btree ("cart_fingerprint","created_at");
CREATE INDEX "shipping_quotes_expires_idx" ON "shipping_quotes" USING btree ("expires_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0011_little_warstar.sql:plain:ed1d4d9660', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0012_new_fantastic_four.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0012_new_fantastic_four.sql:plain:b447f1e929', '1600e32ff1d91704329c6931a54c74cf5fb23207f5152802d4df347d7ff80f0c')) THEN
    EXECUTE $sql$
CREATE TABLE "customer_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"granted" boolean NOT NULL,
	"source" varchar(40) DEFAULT 'admin' NOT NULL,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "customer_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_group_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "customer_group_payment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_group_id" integer NOT NULL,
	"payment_method_code" varchar(40) NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL
);
ALTER TABLE "addresses" ADD COLUMN "phone_normalized" varchar(24) DEFAULT '' NOT NULL;
ALTER TABLE "addresses" ADD COLUMN "delivery_instructions" varchar(240);
ALTER TABLE "addresses" ADD COLUMN "is_default_return" boolean DEFAULT false NOT NULL;
ALTER TABLE "addresses" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "addresses" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "customer_groups" ADD COLUMN "description" text DEFAULT '' NOT NULL;
ALTER TABLE "customer_groups" ADD COLUMN "price_display_method" varchar(16) DEFAULT 'tax_excluded' NOT NULL;
ALTER TABLE "customer_groups" ADD COLUMN "show_prices" boolean DEFAULT true NOT NULL;
ALTER TABLE "customer_groups" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "customer_groups" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
ALTER TABLE "customer_groups" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "customer_groups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "customers" ADD COLUMN "segment" varchar(24) DEFAULT 'individual' NOT NULL;
ALTER TABLE "customers" ADD COLUMN "preferred_language" varchar(5) DEFAULT 'fr' NOT NULL;
ALTER TABLE "customers" ADD COLUMN "newsletter_consent_at" timestamp with time zone;
ALTER TABLE "customers" ADD COLUMN "newsletter_opt_out_at" timestamp with time zone;
ALTER TABLE "customers" ADD COLUMN "last_activity_at" timestamp with time zone;
ALTER TABLE "customers" ADD COLUMN "internal_note" text DEFAULT '' NOT NULL;
ALTER TABLE "customers" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "customers" ADD COLUMN "anonymized_at" timestamp with time zone;
ALTER TABLE "customers" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "customer_group_payment_rules" ADD CONSTRAINT "customer_group_payment_rules_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "customer_consents_customer_purpose_idx" ON "customer_consents" USING btree ("customer_id","purpose","created_at");
CREATE UNIQUE INDEX "customer_group_members_unique" ON "customer_group_members" USING btree ("customer_id","customer_group_id");
CREATE INDEX "customer_group_members_group_idx" ON "customer_group_members" USING btree ("customer_group_id");
CREATE UNIQUE INDEX "customer_group_members_one_primary" ON "customer_group_members" USING btree ("customer_id") WHERE "customer_group_members"."is_primary" = true;
CREATE UNIQUE INDEX "customer_group_payment_rules_unique" ON "customer_group_payment_rules" USING btree ("customer_group_id","payment_method_code");
CREATE INDEX "addresses_active_idx" ON "addresses" USING btree ("customer_id","is_active");
CREATE UNIQUE INDEX "addresses_one_default_shipping" ON "addresses" USING btree ("customer_id") WHERE "addresses"."is_default_shipping" = true AND "addresses"."deleted_at" IS NULL;
CREATE UNIQUE INDEX "addresses_one_default_billing" ON "addresses" USING btree ("customer_id") WHERE "addresses"."is_default_billing" = true AND "addresses"."deleted_at" IS NULL;
CREATE UNIQUE INDEX "customer_groups_one_default" ON "customer_groups" USING btree ("is_default") WHERE "customer_groups"."is_default" = true AND "customer_groups"."deleted_at" IS NULL;
CREATE INDEX "customers_group_fk_idx" ON "customers" USING btree ("customer_group_id");
CREATE INDEX "customers_segment_idx" ON "customers" USING btree ("segment");
CREATE INDEX "customers_activity_idx" ON "customers" USING btree ("last_activity_at");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0012_new_fantastic_four.sql:plain:b447f1e929', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0013_bitter_namora.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0013_bitter_namora.sql:plain:d62ec6dbd0', '8e3df5a091c0691cdc3d07c3092b9cba008bc13f41fa3154d9de18d8b423d468')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled');
CREATE TYPE "public"."return_reason" AS ENUM('damaged', 'wrong_item', 'not_as_described', 'late_delivery', 'changed_mind', 'other');
CREATE TYPE "public"."return_status" AS ENUM('requested', 'approved', 'received', 'refused', 'closed');
CREATE TABLE "document_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_type" varchar(24) NOT NULL,
	"fiscal_year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"return_request_id" uuid,
	"amount_xof" integer NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"method" varchar(40) DEFAULT 'original' NOT NULL,
	"provider_reference" varchar(190),
	"reason" text DEFAULT '' NOT NULL,
	"processed_at" timestamp with time zone,
	"created_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "return_request_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_request_id" uuid NOT NULL,
	"order_item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_xof" integer NOT NULL,
	"restock" boolean DEFAULT false NOT NULL,
	"condition" varchar(16) DEFAULT 'new' NOT NULL
);
CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "return_status" DEFAULT 'requested' NOT NULL,
	"reason" "return_reason" NOT NULL,
	"customer_message" text DEFAULT '' NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"expected_amount_xof" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"refused_at" timestamp with time zone,
	"handled_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
ALTER TABLE "credit_notes" ADD COLUMN "return_id" uuid;
ALTER TABLE "credit_notes" ADD COLUMN "refund_id" uuid;
ALTER TABLE "credit_notes" ADD COLUMN "tax_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "credit_notes" ADD COLUMN "sequence_number" integer;
ALTER TABLE "credit_notes" ADD COLUMN "fiscal_year" integer;
ALTER TABLE "credit_notes" ADD COLUMN "created_by_employee_id" uuid;
ALTER TABLE "invoices" ADD COLUMN "discount_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "billing_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "seller_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "sequence_number" integer;
ALTER TABLE "invoices" ADD COLUMN "fiscal_year" integer;
ALTER TABLE "invoices" ADD COLUMN "note" text DEFAULT '' NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "voided_at" timestamp with time zone;
ALTER TABLE "invoices" ADD COLUMN "void_reason" text;
ALTER TABLE "invoices" ADD COLUMN "created_by_employee_id" uuid;
ALTER TABLE "order_items" ADD COLUMN "product_sku" varchar(80);
ALTER TABLE "order_items" ADD COLUMN "tax_rate_percent" numeric(5, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "discount_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "line_total_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "weight_grams" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "returned_quantity" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN "ecotax_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "reference" varchar(40);
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "seller_paid_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN "subtotal_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "discount_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "tax_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "tracking_number" varchar(120);
ALTER TABLE "orders" ADD COLUMN "internal_note" text DEFAULT '' NOT NULL;
ALTER TABLE "orders" ADD COLUMN "locale" varchar(5) DEFAULT 'fr' NOT NULL;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_request_id_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."return_requests"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_return_request_id_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."return_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_handled_by_employee_id_employees_id_fk" FOREIGN KEY ("handled_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "document_sequences_type_year_unique" ON "document_sequences" USING btree ("document_type","fiscal_year");
CREATE UNIQUE INDEX "refunds_reference_unique" ON "refunds" USING btree ("reference");
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");
CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status","created_at");
CREATE INDEX "return_request_items_request_idx" ON "return_request_items" USING btree ("return_request_id");
CREATE UNIQUE INDEX "return_request_items_unique" ON "return_request_items" USING btree ("return_request_id","order_item_id");
CREATE UNIQUE INDEX "return_requests_reference_unique" ON "return_requests" USING btree ("reference");
CREATE INDEX "return_requests_order_idx" ON "return_requests" USING btree ("order_id");
CREATE INDEX "return_requests_status_idx" ON "return_requests" USING btree ("status","created_at");
CREATE INDEX "return_requests_customer_idx" ON "return_requests" USING btree ("customer_id","created_at");
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "credit_notes_year_sequence_idx" ON "credit_notes" USING btree ("fiscal_year","sequence_number");
CREATE INDEX "invoices_year_sequence_idx" ON "invoices" USING btree ("fiscal_year","sequence_number");
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");
CREATE UNIQUE INDEX "orders_reference_unique" ON "orders" USING btree ("reference");
CREATE INDEX "orders_created_status_idx" ON "orders" USING btree ("created_at","status");
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0013_bitter_namora.sql:plain:d62ec6dbd0', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0014_backend_foundations.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0014_backend_foundations.sql:plain:2bcd980bd9', 'a1f16298cb12c677bc13b9b713391f940abea99eb300c6fde3840735585a4acb')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."domain_event_status" AS ENUM('pending', 'dispatched', 'failed');
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"name" varchar(80) NOT NULL,
	"aggregate_type" varchar(60),
	"aggregate_id" varchar(100),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "domain_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(120) NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'processing' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"domain" varchar(190),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
INSERT INTO "shops" ("id", "code", "name", "is_default", "is_active") VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'mybigmarket', true, true) ON CONFLICT DO NOTHING;
ALTER TABLE "api_keys" ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;
ALTER TABLE "api_keys" ADD COLUMN "revoked_at" timestamp with time zone;
ALTER TABLE "api_keys" ADD COLUMN "shop_id" uuid;
ALTER TABLE "employee_audit_logs" ADD COLUMN "actor_type" varchar(20) DEFAULT 'employee' NOT NULL;
ALTER TABLE "employee_audit_logs" ADD COLUMN "api_key_id" uuid;
ALTER TABLE "employee_audit_logs" ADD COLUMN "shop_id" uuid;
ALTER TABLE "employee_audit_logs" ADD COLUMN "before_state" jsonb;
ALTER TABLE "employee_audit_logs" ADD COLUMN "after_state" jsonb;
ALTER TABLE "employee_audit_logs" ADD COLUMN "changed_fields" jsonb;
ALTER TABLE "employee_audit_logs" ADD COLUMN "request_id" varchar(64);
ALTER TABLE "employee_sessions" ADD COLUMN "family_id" uuid;
ALTER TABLE "employee_sessions" ADD COLUMN "replaced_by_session_id" uuid;
ALTER TABLE "employee_sessions" ADD COLUMN "revoked_reason" varchar(40);
ALTER TABLE "employees" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "settings" ADD COLUMN "shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "domain_events_queue_idx" ON "domain_events" USING btree ("status","available_at");
CREATE INDEX "domain_events_name_time_idx" ON "domain_events" USING btree ("name","occurred_at");
CREATE INDEX "domain_events_aggregate_idx" ON "domain_events" USING btree ("aggregate_type","aggregate_id");
CREATE UNIQUE INDEX "idempotency_keys_scope_key_unique" ON "idempotency_keys" USING btree ("scope","key");
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");
CREATE UNIQUE INDEX "shops_code_unique" ON "shops" USING btree ("code");
CREATE UNIQUE INDEX "shops_domain_unique" ON "shops" USING btree ("domain");
CREATE INDEX "shops_active_idx" ON "shops" USING btree ("is_active");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "employee_audit_logs" ADD CONSTRAINT "employee_audit_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "employee_audit_logs" ADD CONSTRAINT "employee_audit_logs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "settings" ADD CONSTRAINT "settings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "employee_audit_action_time_idx" ON "employee_audit_logs" USING btree ("action","created_at");
CREATE INDEX "employee_audit_time_idx" ON "employee_audit_logs" USING btree ("created_at");
CREATE INDEX "employee_sessions_family_idx" ON "employee_sessions" USING btree ("family_id");
CREATE INDEX "employees_deleted_idx" ON "employees" USING btree ("deleted_at");
CREATE UNIQUE INDEX "settings_shop_key_unique" ON "settings" USING btree ("shop_id","key");
DROP INDEX "settings_key_unique";
UPDATE "employee_sessions" SET "family_id" = "id" WHERE "family_id" IS NULL;
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0014_backend_foundations.sql:plain:2bcd980bd9', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0015_catalog_pricing_stock.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0015_catalog_pricing_stock.sql:plain:b9de9bd60b', 'ddc46587e8f9a81daab52a5b080ef9666438a1338ca89e90e47d1c339d8138a9')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."price_reduction_type" AS ENUM('percent', 'amount', 'fixed_price');
CREATE TYPE "public"."stock_reservation_status" AS ENUM('active', 'consumed', 'released', 'expired');
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0015_catalog_pricing_stock.sql:plain:b9de9bd60b', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0015_catalog_pricing_stock.sql:alter-type-add-value:67b5f5354b', 'ddc46587e8f9a81daab52a5b080ef9666438a1338ca89e90e47d1c339d8138a9')) THEN
    -- ALTER TYPE … ADD VALUE : commande utilitaire, via EXECUTE et seule
    -- dans sa transaction (contrainte PostgreSQL).
    EXECUTE $sql$
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'transfer';
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'inventory';
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'import';
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0015_catalog_pricing_stock.sql:alter-type-add-value:67b5f5354b', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0015_catalog_pricing_stock.sql:plain:517532b28f', 'ddc46587e8f9a81daab52a5b080ef9666438a1338ca89e90e47d1c339d8138a9')) THEN
    EXECUTE $sql$
CREATE TABLE "catalog_price_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"customer_group_id" integer,
	"country_code" varchar(2),
	"currency" varchar(3),
	"from_quantity" integer DEFAULT 1 NOT NULL,
	"reduction_type" "price_reduction_type" NOT NULL,
	"reduction_value" numeric(12, 2) NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"date_from" timestamp with time zone,
	"date_to" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
CREATE TABLE "product_downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"file_name" varchar(190) NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(120) DEFAULT 'application/octet-stream' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"max_downloads" integer,
	"expires_after_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "product_variant_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"image_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "promo_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"amount_xof" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "specific_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"customer_id" uuid,
	"customer_group_id" integer,
	"country_code" varchar(2),
	"currency" varchar(3),
	"from_quantity" integer DEFAULT 1 NOT NULL,
	"reduction_type" "price_reduction_type" NOT NULL,
	"reduction_value" numeric(12, 2) NOT NULL,
	"date_from" timestamp with time zone,
	"date_to" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by_employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "stock_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"physical_quantity" integer DEFAULT 0 NOT NULL,
	"reserved_quantity" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer,
	"location" varchar(60),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"quantity" integer NOT NULL,
	"status" "stock_reservation_status" DEFAULT 'active' NOT NULL,
	"order_id" uuid,
	"cart_id" uuid,
	"reference" varchar(120),
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"country_code" varchar(2) DEFAULT 'CI' NOT NULL,
	"city" varchar(120),
	"address" text,
	"manager_employee_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_sellable" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
ALTER TABLE "categories" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "categories" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "products" ADD COLUMN "redirect_target" varchar(300);
ALTER TABLE "promo_codes" ADD COLUMN "shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "name" varchar(120);
ALTER TABLE "promo_codes" ADD COLUMN "description" text;
ALTER TABLE "promo_codes" ADD COLUMN "customer_id" uuid;
ALTER TABLE "promo_codes" ADD COLUMN "customer_group_id" integer;
ALTER TABLE "promo_codes" ADD COLUMN "per_customer_limit" integer;
ALTER TABLE "promo_codes" ADD COLUMN "free_shipping" boolean DEFAULT false NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "combinable" boolean DEFAULT false NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "exclude_discounted_products" boolean DEFAULT false NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "promo_codes" ADD COLUMN "deleted_at" timestamp with time zone;
ALTER TABLE "stock_movements" ADD COLUMN "warehouse_id" uuid;
ALTER TABLE "stock_movements" ADD COLUMN "reservation_id" uuid;
ALTER TABLE "stock_movements" ADD COLUMN "reference" varchar(120);
ALTER TABLE "catalog_price_rules" ADD CONSTRAINT "catalog_price_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "catalog_price_rules" ADD CONSTRAINT "catalog_price_rules_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "catalog_price_rules" ADD CONSTRAINT "catalog_price_rules_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "product_downloads" ADD CONSTRAINT "product_downloads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_image_id_product_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."product_images"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_employee_id_employees_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "catalog_price_rules_active_idx" ON "catalog_price_rules" USING btree ("shop_id","is_active","date_from","date_to");
CREATE UNIQUE INDEX "product_downloads_product_unique" ON "product_downloads" USING btree ("product_id");
CREATE UNIQUE INDEX "product_variant_images_unique" ON "product_variant_images" USING btree ("variant_id","image_id");
CREATE INDEX "product_variant_images_image_idx" ON "product_variant_images" USING btree ("image_id");
CREATE INDEX "promo_code_redemptions_code_customer_idx" ON "promo_code_redemptions" USING btree ("promo_code_id","customer_id");
CREATE UNIQUE INDEX "promo_code_redemptions_code_order_unique" ON "promo_code_redemptions" USING btree ("promo_code_id","order_id");
CREATE INDEX "specific_prices_product_idx" ON "specific_prices" USING btree ("product_id","variant_id");
CREATE INDEX "specific_prices_period_idx" ON "specific_prices" USING btree ("date_from","date_to");
CREATE INDEX "specific_prices_customer_idx" ON "specific_prices" USING btree ("customer_id");
CREATE INDEX "specific_prices_group_idx" ON "specific_prices" USING btree ("customer_group_id");
CREATE UNIQUE INDEX "stock_levels_product_unique" ON "stock_levels" USING btree ("warehouse_id","product_id") WHERE "stock_levels"."variant_id" IS NULL;
CREATE UNIQUE INDEX "stock_levels_variant_unique" ON "stock_levels" USING btree ("warehouse_id","product_id","variant_id") WHERE "stock_levels"."variant_id" IS NOT NULL;
CREATE INDEX "stock_levels_product_idx" ON "stock_levels" USING btree ("product_id","variant_id");
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id","status");
CREATE INDEX "stock_reservations_product_idx" ON "stock_reservations" USING btree ("product_id","status");
CREATE INDEX "stock_reservations_expiry_idx" ON "stock_reservations" USING btree ("status","expires_at");
CREATE UNIQUE INDEX "warehouses_shop_code_unique" ON "warehouses" USING btree ("shop_id","code");
CREATE UNIQUE INDEX "warehouses_one_default" ON "warehouses" USING btree ("shop_id") WHERE "warehouses"."is_default" = true AND "warehouses"."deleted_at" IS NULL;
CREATE INDEX "warehouses_active_idx" ON "warehouses" USING btree ("shop_id","is_active","position");
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservation_id_stock_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stock_reservations"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "stock_movements_warehouse_time_idx" ON "stock_movements" USING btree ("warehouse_id","created_at");
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");
-- Entrepôt par défaut de la boutique par défaut (identifiant fixe, voir DEFAULT_WAREHOUSE_ID).
INSERT INTO "warehouses" ("id", "shop_id", "code", "name", "country_code", "city", "is_default", "is_sellable", "position")
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'principal', 'Entrepôt principal', 'CI', 'Abidjan', true, true, 0)
ON CONFLICT DO NOTHING;
-- Reprise du stock existant : chaque compteur actuel devient le stock physique de l'entrepôt par défaut.
-- Aucune quantité n'est modifiée : products.quantity et product_variants.stock restent identiques.
INSERT INTO "stock_levels" ("warehouse_id", "product_id", "variant_id", "physical_quantity", "reserved_quantity")
SELECT '00000000-0000-4000-8000-000000000002', "id", NULL, "quantity", 0 FROM "products"
ON CONFLICT DO NOTHING;
INSERT INTO "stock_levels" ("warehouse_id", "product_id", "variant_id", "physical_quantity", "reserved_quantity")
SELECT '00000000-0000-4000-8000-000000000002', "product_id", "id", "stock", 0 FROM "product_variants" WHERE "deleted_at" IS NULL
ON CONFLICT DO NOTHING;
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0015_catalog_pricing_stock.sql:plain:517532b28f', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0016_checkout_customers.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0016_checkout_customers.sql:plain:8e998ab709', '9016618417d7970f0e1e923730bf11ec236e051783dd840195ff9421f4ff1bd6')) THEN
    EXECUTE $sql$
ALTER TABLE "carts" ADD COLUMN "voucher_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;
ALTER TABLE "orders" ADD COLUMN "checkout_group_id" uuid;
ALTER TABLE "orders" ADD COLUMN "applied_vouchers" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "orders_checkout_group_idx" ON "orders" USING btree ("checkout_group_id");
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at");
-- Rattache les commandes existantes au profil client de l'acheteur, quand il existe.
UPDATE "orders" o SET "customer_id" = c."id" FROM "customers" c WHERE c."user_id" = o."buyer_id" AND o."customer_id" IS NULL;
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0016_checkout_customers.sql:plain:8e998ab709', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0017_delivery_payments.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0017_delivery_payments.sql:plain:63e9d4dc10', 'de001c2b35ef0e880039cc1cf2c8359cbc8367d8aaaae94f740aad4814b8dee0')) THEN
    EXECUTE $sql$
CREATE TYPE "public"."payment_intent_status" AS ENUM('pending', 'succeeded', 'failed', 'cancelled', 'expired');
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0017_delivery_payments.sql:plain:63e9d4dc10', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0017_delivery_payments.sql:alter-type-add-value:01d7c83698', 'de001c2b35ef0e880039cc1cf2c8359cbc8367d8aaaae94f740aad4814b8dee0')) THEN
    -- ALTER TYPE … ADD VALUE : commande utilitaire, via EXECUTE et seule
    -- dans sa transaction (contrainte PostgreSQL).
    EXECUTE $sql$
ALTER TYPE "public"."payment_method" ADD VALUE 'moov_money' BEFORE 'mock';
ALTER TYPE "public"."payment_method" ADD VALUE 'cash_on_delivery' BEFORE 'mock';
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0017_delivery_payments.sql:alter-type-add-value:01d7c83698', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0017_delivery_payments.sql:plain:01f1bd7c08', 'de001c2b35ef0e880039cc1cf2c8359cbc8367d8aaaae94f740aad4814b8dee0')) THEN
    EXECUTE $sql$
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"checkout_group_id" uuid,
	"user_id" uuid,
	"customer_id" uuid,
	"method" "payment_method" NOT NULL,
	"provider" varchar(40) NOT NULL,
	"amount_xof" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"status" "payment_intent_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" varchar(190),
	"checkout_url" text,
	"instructions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"country_code" varchar(2),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"failure_reason" varchar(240),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid,
	"payment_id" uuid,
	"order_id" uuid,
	"refund_id" uuid,
	"kind" varchar(32) NOT NULL,
	"status" varchar(24) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_reference" varchar(190),
	"amount_xof" integer,
	"request" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"actor_type" varchar(20) DEFAULT 'system' NOT NULL,
	"actor_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"event_key" varchar(190) NOT NULL,
	"intent_id" uuid,
	"signature_valid" boolean NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"outcome" varchar(60),
	"payload_sha256" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
ALTER TABLE "orders" ADD COLUMN "shipping_method_id" uuid;
ALTER TABLE "orders" ADD COLUMN "tracking_url" text;
ALTER TABLE "payments" ADD COLUMN "intent_id" uuid;
ALTER TABLE "payments" ADD COLUMN "paid_at" timestamp with time zone;
ALTER TABLE "payments" ADD COLUMN "refunded_amount_xof" integer DEFAULT 0 NOT NULL;
ALTER TABLE "payments" ADD COLUMN "failure_reason" varchar(240);
ALTER TABLE "payments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "shipments" ADD COLUMN "mode" "shipping_mode";
ALTER TABLE "shipments" ADD COLUMN "carrier_name" varchar(120);
ALTER TABLE "shipments" ADD COLUMN "tracking_number" varchar(120);
ALTER TABLE "shipments" ADD COLUMN "tracking_url" text;
ALTER TABLE "shipments" ADD COLUMN "expected_arrival_at" timestamp with time zone;
ALTER TABLE "shipments" ADD COLUMN "note" text DEFAULT '' NOT NULL;
ALTER TABLE "shipments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "payment_intents_reference_unique" ON "payment_intents" USING btree ("reference");
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status","created_at");
CREATE INDEX "payment_intents_group_idx" ON "payment_intents" USING btree ("checkout_group_id");
CREATE INDEX "payment_intents_provider_ref_idx" ON "payment_intents" USING btree ("provider","provider_reference");
CREATE INDEX "payment_intents_user_idx" ON "payment_intents" USING btree ("user_id","created_at");
CREATE INDEX "payment_transactions_intent_idx" ON "payment_transactions" USING btree ("intent_id","created_at");
CREATE INDEX "payment_transactions_order_idx" ON "payment_transactions" USING btree ("order_id","created_at");
CREATE INDEX "payment_transactions_kind_idx" ON "payment_transactions" USING btree ("kind","created_at");
CREATE UNIQUE INDEX "payment_webhook_events_key_unique" ON "payment_webhook_events" USING btree ("provider","event_key");
CREATE INDEX "payment_webhook_events_status_idx" ON "payment_webhook_events" USING btree ("status","received_at");
CREATE INDEX "payment_webhook_events_intent_idx" ON "payment_webhook_events" USING btree ("intent_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "payments_intent_idx" ON "payments" USING btree ("intent_id");
-- Nouveaux moyens de paiement, désactivés par défaut : l'équipe les active quand le prestataire
-- (Moov Money) ou la logistique d'encaissement (paiement à la livraison) est prête.
INSERT INTO "payment_methods" ("code", "name", "provider", "is_active") VALUES
  ('moov_money', 'Moov Money', 'moov-money', false),
  ('cash_on_delivery', 'Paiement à la livraison', 'cash-on-delivery', false)
ON CONFLICT ("code") DO NOTHING;
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0017_delivery_payments.sql:plain:01f1bd7c08', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- ============ 0018_content_search_messaging.sql ============
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash IN ('0018_content_search_messaging.sql:plain:8b0659ca41', 'c110cdbac6dec108a0e75dcefd2843859744cc7d1b23b20f46b8a7312cc670f3')) THEN
    EXECUTE $sql$
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"email" varchar(190),
	"user_id" uuid,
	"ip_hash" varchar(64),
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notify_email" varchar(190),
	"success_message" varchar(400) DEFAULT 'Merci, votre message a bien été envoyé.' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer NOT NULL,
	"parent_id" integer,
	"label" varchar(120) NOT NULL,
	"link_type" varchar(20) NOT NULL,
	"target" varchar(300) DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"opens_new_tab" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" varchar(20) NOT NULL,
	"to_address" varchar(40) NOT NULL,
	"template_code" varchar(60),
	"locale" varchar(5) DEFAULT 'fr' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" varchar(190),
	"dedupe_key" varchar(190),
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "banners" ADD COLUMN "placement" varchar(40) DEFAULT 'home' NOT NULL;
ALTER TABLE "cms_pages" ADD COLUMN "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "cms_pages" ADD COLUMN "excerpt" text DEFAULT '' NOT NULL;
ALTER TABLE "cms_pages" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "email_queue" ADD COLUMN "dedupe_key" varchar(190);
ALTER TABLE "email_queue" ADD COLUMN "locale" varchar(5) DEFAULT 'fr' NOT NULL;
ALTER TABLE "slug_redirects" ADD COLUMN "status_code" integer DEFAULT 301 NOT NULL;
ALTER TABLE "slug_redirects" ADD COLUMN "hits" integer DEFAULT 0 NOT NULL;
ALTER TABLE "slug_redirects" ADD COLUMN "last_hit_at" timestamp with time zone;
ALTER TABLE "slug_redirects" ADD COLUMN "note" varchar(240) DEFAULT '' NOT NULL;
ALTER TABLE "slug_redirects" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_menu_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id","created_at");
CREATE INDEX "form_submissions_status_idx" ON "form_submissions" USING btree ("status","created_at");
CREATE UNIQUE INDEX "forms_code_unique" ON "forms" USING btree ("code");
CREATE INDEX "menu_items_menu_idx" ON "menu_items" USING btree ("menu_id","parent_id","position");
CREATE UNIQUE INDEX "menus_code_unique" ON "menus" USING btree ("code");
CREATE INDEX "outbound_messages_status_idx" ON "outbound_messages" USING btree ("status","scheduled_at");
CREATE UNIQUE INDEX "outbound_messages_dedupe_unique" ON "outbound_messages" USING btree ("dedupe_key");
CREATE UNIQUE INDEX "email_queue_dedupe_unique" ON "email_queue" USING btree ("dedupe_key");
-- Recherche (étape 6) : extensions « de confiance » de PostgreSQL, installables par le propriétaire de la base.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- unaccent() est STABLE ; cette enveloppe IMMUTABLE (dictionnaire fixé) permet de l'indexer.
CREATE OR REPLACE FUNCTION public.mbm_unaccent(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS 'SELECT public.unaccent(''public.unaccent''::regdictionary, value)';
-- Document de recherche d'un produit : titre et référence (poids A), résumé (B), description (C), en français sans accents.
CREATE OR REPLACE FUNCTION public.mbm_product_document(title text, reference text, short_description text, description text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS 'SELECT setweight(to_tsvector(''french'', public.mbm_unaccent(coalesce(title, ''''))), ''A'')
          || setweight(to_tsvector(''simple'', public.mbm_unaccent(coalesce(reference, ''''))), ''A'')
          || setweight(to_tsvector(''french'', public.mbm_unaccent(coalesce(short_description, ''''))), ''B'')
          || setweight(to_tsvector(''french'', public.mbm_unaccent(left(coalesce(description, ''''), 20000))), ''C'')';
CREATE INDEX IF NOT EXISTS "products_search_document_idx" ON "products" USING gin (public.mbm_product_document("title", "reference", "short_description", "description"));
-- Tolérance aux fautes de frappe : trigrammes sur le titre sans accents.
CREATE INDEX IF NOT EXISTS "products_title_trgm_idx" ON "products" USING gin (public.mbm_unaccent(lower("title")) gin_trgm_ops);
-- Formulaire de contact livré prêt à l'emploi (modifiable dans l'administration).
INSERT INTO "forms" ("code", "title", "description", "fields") VALUES ('contact', 'Nous contacter', 'Une question sur une commande, un fournisseur ou une livraison ? Écrivez-nous.',
  '[{"name":"name","label":"Nom","type":"text","required":true,"maxLength":160},{"name":"email","label":"E-mail","type":"email","required":true,"maxLength":190},{"name":"phone","label":"Téléphone","type":"tel","required":false,"maxLength":32},{"name":"subject","label":"Sujet","type":"select","required":true,"options":["Commande","Paiement","Livraison","Devenir vendeur","Autre"]},{"name":"orderReference","label":"Référence de commande","type":"text","required":false,"maxLength":40},{"name":"message","label":"Message","type":"textarea","required":true,"maxLength":4000}]'::jsonb)
ON CONFLICT ("code") DO NOTHING;
-- Menu de pied de page reprenant les pages existantes de la boutique.
INSERT INTO "menus" ("code", "name") VALUES ('footer', 'Pied de page'), ('header', 'En-tête') ON CONFLICT ("code") DO NOTHING;
INSERT INTO "menu_items" ("menu_id", "label", "link_type", "target", "position")
SELECT m.id, v.label, 'url', v.target, v.position FROM "menus" m
CROSS JOIN (VALUES ('Comment ça marche', '/comment-ca-marche', 0), ('Demande de devis', '/demande-de-devis', 1), ('Conditions générales', '/conditions', 2), ('Confidentialité', '/confidentialite', 3)) AS v(label, target, position)
WHERE m.code = 'footer' AND NOT EXISTS (SELECT 1 FROM "menu_items" i WHERE i.menu_id = m.id);
$sql$;
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES ('0018_content_search_messaging.sql:plain:8b0659ca41', (EXTRACT(EPOCH FROM now()) * 1000)::bigint);
  END IF;
END
$migration$;


-- Contrôle final : doit afficher le nombre de fichiers ci-dessus.
SELECT count(*) AS migrations_appliquees FROM drizzle.__drizzle_migrations;
