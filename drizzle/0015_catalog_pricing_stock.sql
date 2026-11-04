CREATE TYPE "public"."price_reduction_type" AS ENUM('percent', 'amount', 'fixed_price');--> statement-breakpoint
CREATE TYPE "public"."stock_reservation_status" AS ENUM('active', 'consumed', 'released', 'expired');--> statement-breakpoint
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'transfer';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'inventory';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'import';--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "product_variant_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"image_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"amount_xof" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "redirect_target" varchar(300);--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "name" varchar(120);--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "customer_group_id" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "per_customer_limit" integer;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "free_shipping" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "combinable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "exclude_discounted_products" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "reference" varchar(120);--> statement-breakpoint
ALTER TABLE "catalog_price_rules" ADD CONSTRAINT "catalog_price_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_price_rules" ADD CONSTRAINT "catalog_price_rules_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_price_rules" ADD CONSTRAINT "catalog_price_rules_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_downloads" ADD CONSTRAINT "product_downloads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_image_id_product_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."product_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specific_prices" ADD CONSTRAINT "specific_prices_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_employee_id_employees_id_fk" FOREIGN KEY ("manager_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_price_rules_active_idx" ON "catalog_price_rules" USING btree ("shop_id","is_active","date_from","date_to");--> statement-breakpoint
CREATE UNIQUE INDEX "product_downloads_product_unique" ON "product_downloads" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variant_images_unique" ON "product_variant_images" USING btree ("variant_id","image_id");--> statement-breakpoint
CREATE INDEX "product_variant_images_image_idx" ON "product_variant_images" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "promo_code_redemptions_code_customer_idx" ON "promo_code_redemptions" USING btree ("promo_code_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_redemptions_code_order_unique" ON "promo_code_redemptions" USING btree ("promo_code_id","order_id");--> statement-breakpoint
CREATE INDEX "specific_prices_product_idx" ON "specific_prices" USING btree ("product_id","variant_id");--> statement-breakpoint
CREATE INDEX "specific_prices_period_idx" ON "specific_prices" USING btree ("date_from","date_to");--> statement-breakpoint
CREATE INDEX "specific_prices_customer_idx" ON "specific_prices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "specific_prices_group_idx" ON "specific_prices" USING btree ("customer_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_levels_product_unique" ON "stock_levels" USING btree ("warehouse_id","product_id") WHERE "stock_levels"."variant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_levels_variant_unique" ON "stock_levels" USING btree ("warehouse_id","product_id","variant_id") WHERE "stock_levels"."variant_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "stock_levels_product_idx" ON "stock_levels" USING btree ("product_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_order_idx" ON "stock_reservations" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "stock_reservations_product_idx" ON "stock_reservations" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "stock_reservations_expiry_idx" ON "stock_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_shop_code_unique" ON "warehouses" USING btree ("shop_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_one_default" ON "warehouses" USING btree ("shop_id") WHERE "warehouses"."is_default" = true AND "warehouses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "warehouses_active_idx" ON "warehouses" USING btree ("shop_id","is_active","position");--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservation_id_stock_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stock_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_warehouse_time_idx" ON "stock_movements" USING btree ("warehouse_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
-- Entrepôt par défaut de la boutique par défaut (identifiant fixe, voir DEFAULT_WAREHOUSE_ID).
INSERT INTO "warehouses" ("id", "shop_id", "code", "name", "country_code", "city", "is_default", "is_sellable", "position")
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'principal', 'Entrepôt principal', 'CI', 'Abidjan', true, true, 0)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Reprise du stock existant : chaque compteur actuel devient le stock physique de l'entrepôt par défaut.
-- Aucune quantité n'est modifiée : products.quantity et product_variants.stock restent identiques.
INSERT INTO "stock_levels" ("warehouse_id", "product_id", "variant_id", "physical_quantity", "reserved_quantity")
SELECT '00000000-0000-4000-8000-000000000002', "id", NULL, "quantity", 0 FROM "products"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "stock_levels" ("warehouse_id", "product_id", "variant_id", "physical_quantity", "reserved_quantity")
SELECT '00000000-0000-4000-8000-000000000002', "product_id", "id", "stock", 0 FROM "product_variants" WHERE "deleted_at" IS NULL
ON CONFLICT DO NOTHING;
