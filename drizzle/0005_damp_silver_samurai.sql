CREATE TYPE "public"."conversation_kind" AS ENUM('supplier', 'support', 'dispute');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'invited', 'disabled', 'locked');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'void');--> statement-breakpoint
CREATE TYPE "public"."message_author" AS ENUM('customer', 'supplier', 'employee');--> statement-breakpoint
CREATE TYPE "public"."review_subject" AS ENUM('product', 'supplier');--> statement-breakpoint
CREATE TYPE "public"."shipping_mode" AS ENUM('air', 'sea');--> statement-breakpoint
CREATE TYPE "public"."shipping_preference" AS ENUM('air_only', 'sea_only', 'both', 'automatic');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'bank_transfer' BEFORE 'mock';--> statement-breakpoint
ALTER TYPE "public"."product_status" ADD VALUE 'published' BEFORE 'rejected';--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(120) NOT NULL,
	"label" varchar(140) NOT NULL,
	"resource" varchar(60) NOT NULL,
	"action" varchar(40) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"logo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" integer,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(100) NOT NULL,
	"discount_basis_points" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(48),
	"to_status" varchar(48) NOT NULL,
	"employee_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"label" varchar(100) NOT NULL,
	"color" varchar(7) DEFAULT '#64748b' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_country_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"is_allowed" boolean DEFAULT false NOT NULL,
	"minimum_amount_xof" integer DEFAULT 0 NOT NULL,
	"maximum_amount_xof" integer
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "product_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_key_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"keyword" varchar(160) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"minimum_quantity" integer NOT NULL,
	"maximum_quantity" integer,
	"preparation_days" integer,
	"negotiable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "related_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"related_product_id" uuid NOT NULL,
	"relation_type" varchar(32) DEFAULT 'related' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"value" jsonb NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"updated_by_employee_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"country_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_path" varchar(300) NOT NULL,
	"new_path" varchar(300) NOT NULL,
	"product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
DROP INDEX "product_variants_product_idx";--> statement-breakpoint
DROP INDEX "reviews_product_publish_idx";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "kind" "conversation_kind" DEFAULT 'supplier' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assigned_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_type" "message_author" DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "applied_tier_minimum_quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_mode" "shipping_mode";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shipping_cost_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_cost_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_mode" "shipping_mode";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_quote_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_reference" varchar(190);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "country_code" varchar(2);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "sku" varchar(80);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "price_xof" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sku" varchar(80);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "short_description" varchar(320);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "purchase_price_xof" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_title" varchar(190);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "seo_description" varchar(320);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "open_graph_image_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "canonical_path" varchar(300);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "allow_reviews" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "subject" "review_subject" DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "verified_purchase" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "moderated_by_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_login_events" ADD CONSTRAINT "employee_login_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_sessions" ADD CONSTRAINT "employee_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_country_rules" ADD CONSTRAINT "payment_country_rules_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attachments" ADD CONSTRAINT "product_attachments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attachments" ADD CONSTRAINT "product_attachments_uploaded_by_employee_id_employees_id_fk" FOREIGN KEY ("uploaded_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_key_attributes" ADD CONSTRAINT "product_key_attributes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_key_attributes" ADD CONSTRAINT "product_key_attributes_attribute_id_product_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_keywords" ADD CONSTRAINT "product_keywords_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_times" ADD CONSTRAINT "lead_times_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_products" ADD CONSTRAINT "related_products_related_product_id_products_id_fk" FOREIGN KEY ("related_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_orders" ADD CONSTRAINT "shipment_orders_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rules" ADD CONSTRAINT "shipping_rules_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD CONSTRAINT "slug_redirects_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_actor_time_idx" ON "activity_logs" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_unique" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource","action");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_unique" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "banners_active_order_idx" ON "banners" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_unique" ON "brands" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_product_without_variant_unique" ON "cart_items" USING btree ("cart_id","product_id") WHERE "cart_items"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_product_variant_unique" ON "cart_items" USING btree ("cart_id","product_id","variant_id") WHERE "cart_items"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cart_items_product_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_guest_token_unique" ON "carts" USING btree ("guest_token_hash");--> statement-breakpoint
CREATE INDEX "carts_customer_status_idx" ON "carts" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "carts_abandoned_idx" ON "carts" USING btree ("status","abandoned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_pages_slug_unique" ON "cms_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_pages_status_idx" ON "cms_pages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_number_unique" ON "credit_notes" USING btree ("credit_note_number");--> statement-breakpoint
CREATE INDEX "credit_notes_order_idx" ON "credit_notes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "addresses_country_city_idx" ON "addresses" USING btree ("country_code","city");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_groups_code_unique" ON "customer_groups" USING btree ("code");--> statement-breakpoint
CREATE INDEX "customer_groups_active_idx" ON "customer_groups" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_unique" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_group_idx" ON "customers" USING btree ("customer_group");--> statement-breakpoint
CREATE INDEX "employee_login_email_time_idx" ON "employee_login_events" USING btree ("email_attempted","created_at");--> statement-breakpoint
CREATE INDEX "employee_login_ip_time_idx" ON "employee_login_events" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_sessions_token_hash_unique" ON "employee_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "employee_sessions_employee_active_idx" ON "employee_sessions" USING btree ("employee_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_email_unique" ON "employees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "employees_role_idx" ON "employees" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_currency_pair_unique" ON "exchange_rates" USING btree ("base_currency","quote_currency");--> statement-breakpoint
CREATE INDEX "exchange_rates_updated_idx" ON "exchange_rates" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_product_time_idx" ON "inventory_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_variant_time_idx" ON "inventory_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_order_unique" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_status_history_order_time_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_employee_idx" ON "order_status_history" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_statuses_code_unique" ON "order_statuses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "order_statuses_active_order_idx" ON "order_statuses" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_country_rules_method_country_unique" ON "payment_country_rules" USING btree ("payment_method_id","country_code");--> statement-breakpoint
CREATE INDEX "payment_country_rules_country_idx" ON "payment_country_rules" USING btree ("country_code","is_allowed");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_code_unique" ON "payment_methods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "payment_methods_active_idx" ON "payment_methods" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "product_attachments_product_idx" ON "product_attachments" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_attributes_product_idx" ON "product_attributes" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_attributes_name_idx" ON "product_attributes" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_key_attributes_product_order_unique" ON "product_key_attributes" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_key_attributes_attribute_unique" ON "product_key_attributes" USING btree ("product_id","attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_keywords_product_keyword_unique" ON "product_keywords" USING btree ("product_id","keyword");--> statement-breakpoint
CREATE INDEX "product_keywords_keyword_idx" ON "product_keywords" USING btree ("keyword");--> statement-breakpoint
CREATE INDEX "lead_times_product_order_idx" ON "lead_times" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_packaging_product_unique" ON "product_packaging" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_tiers_default_variant_min_unique" ON "price_tiers" USING btree ("product_id","minimum_quantity") WHERE "price_tiers"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "price_tiers_specific_variant_min_unique" ON "price_tiers" USING btree ("product_id","variant_id","minimum_quantity") WHERE "price_tiers"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "price_tiers_product_qty_idx" ON "price_tiers" USING btree ("product_id","minimum_quantity");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_code_unique" ON "promo_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_codes_active_period_idx" ON "promo_codes" USING btree ("is_active","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "related_products_pair_type_unique" ON "related_products" USING btree ("product_id","related_product_id","relation_type");--> statement-breakpoint
CREATE INDEX "related_products_product_order_idx" ON "related_products" USING btree ("product_id","relation_type","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_pair_unique" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_unique" ON "settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_orders_order_unique" ON "shipment_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_orders_shipment_idx" ON "shipment_orders" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_methods_code_unique" ON "shipping_methods" USING btree ("code");--> statement-breakpoint
CREATE INDEX "shipping_methods_active_mode_idx" ON "shipping_methods" USING btree ("is_active","mode");--> statement-breakpoint
CREATE INDEX "shipping_rates_lookup_idx" ON "shipping_rates" USING btree ("shipping_method_id","shipping_zone_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_rules_global_method_code_unique" ON "shipping_rules" USING btree ("shipping_method_id","code") WHERE "shipping_rules"."shipping_zone_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_rules_zoned_method_code_unique" ON "shipping_rules" USING btree ("shipping_method_id","shipping_zone_id","code") WHERE "shipping_rules"."shipping_zone_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shipping_rules_method_priority_idx" ON "shipping_rules" USING btree ("shipping_method_id","is_enabled","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_zones_code_unique" ON "shipping_zones" USING btree ("code");--> statement-breakpoint
CREATE INDEX "shipping_zones_active_order_idx" ON "shipping_zones" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "slug_redirects_old_path_unique" ON "slug_redirects" USING btree ("old_path");--> statement-breakpoint
CREATE INDEX "slug_redirects_product_idx" ON "slug_redirects" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_slug_unique" ON "suppliers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "suppliers_country_active_idx" ON "suppliers" USING btree ("country_code","is_active");--> statement-breakpoint
CREATE INDEX "suppliers_user_idx" ON "suppliers" USING btree ("seller_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rules_code_country_region_unique" ON "tax_rules" USING btree ("code","country_code","region");--> statement-breakpoint
CREATE INDEX "tax_rules_country_active_idx" ON "tax_rules" USING btree ("country_code","is_active");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_employee_id_employees_id_fk" FOREIGN KEY ("sender_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_employee_id_employees_id_fk" FOREIGN KEY ("moderated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_employee_idx" ON "messages" USING btree ("sender_employee_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_primary_unique" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_name_value_unique" ON "product_variants" USING btree ("product_id","name","value");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_unique" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_supplier_idx" ON "products" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "reviews_supplier_publish_idx" ON "reviews" USING btree ("supplier_id","is_published","verified_purchase");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id","is_active");--> statement-breakpoint
CREATE INDEX "reviews_product_publish_idx" ON "reviews" USING btree ("product_id","is_published","verified_purchase");