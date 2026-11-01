CREATE TYPE "public"."customization_type" AS ENUM('text', 'file');--> statement-breakpoint
CREATE TYPE "public"."out_of_stock_behavior" AS ENUM('refuse', 'backorder', 'use_default');--> statement-breakpoint
CREATE TYPE "public"."product_condition" AS ENUM('new', 'used', 'refurbished');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('standard', 'pack', 'virtual');--> statement-breakpoint
CREATE TYPE "public"."product_visibility" AS ENUM('everywhere', 'catalog', 'search', 'nowhere');--> statement-breakpoint
CREATE TYPE "public"."redirect_target_type" AS ENUM('category', 'product', 'url');--> statement-breakpoint
CREATE TYPE "public"."redirect_type" AS ENUM('301', '302');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_reason" AS ENUM('purchase', 'sale', 'return', 'adjustment', 'loss', 'restock', 'pack', 'cancellation');--> statement-breakpoint
CREATE TABLE "pack_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_product_id" uuid NOT NULL,
	"component_product_id" uuid NOT NULL,
	"component_variant_id" integer,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"shipping_method_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "product_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_reference" varchar(80),
	"purchase_price_xof" integer,
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"tag" varchar(60) NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reference" varchar(64);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_type" "product_type" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ean13" varchar(13);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "upc" varchar(12);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "isbn" varchar(17);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "mpn" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition" "product_condition" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "visibility" "product_visibility" DEFAULT 'everywhere' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "available_for_order" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "show_price" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "out_of_stock_behavior" "out_of_stock_behavior" DEFAULT 'use_default' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "restock_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "in_stock_message" varchar(120);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "out_of_stock_message" varchar(120);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ecotax_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_price_xof" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit_label" varchar(20);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight_grams" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "length_mm" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "width_mm" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "height_mm" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "additional_shipping_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "delivery_time_days" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "redirect_type" "redirect_type";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "redirect_target_type" "redirect_target_type";--> statement-breakpoint
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_pack_product_id_products_id_fk" FOREIGN KEY ("pack_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_component_product_id_products_id_fk" FOREIGN KEY ("component_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_items" ADD CONSTRAINT "pack_items_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_carriers" ADD CONSTRAINT "product_carriers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_carriers" ADD CONSTRAINT "product_carriers_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_customizations" ADD CONSTRAINT "product_customizations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_suppliers" ADD CONSTRAINT "product_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pack_items_unique" ON "pack_items" USING btree ("pack_product_id","component_product_id","component_variant_id");--> statement-breakpoint
CREATE INDEX "pack_items_pack_idx" ON "pack_items" USING btree ("pack_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_carriers_unique" ON "product_carriers" USING btree ("product_id","shipping_method_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_unique" ON "product_categories" USING btree ("product_id","category_id");--> statement-breakpoint
CREATE INDEX "product_categories_category_idx" ON "product_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_one_default" ON "product_categories" USING btree ("product_id") WHERE "product_categories"."is_default" = true;--> statement-breakpoint
CREATE INDEX "product_customizations_product_idx" ON "product_customizations" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_suppliers_unique" ON "product_suppliers" USING btree ("product_id","supplier_id");--> statement-breakpoint
CREATE INDEX "product_suppliers_supplier_idx" ON "product_suppliers" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_tags_unique" ON "product_tags" USING btree ("product_id","tag");--> statement-breakpoint
CREATE INDEX "product_tags_tag_idx" ON "product_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "stock_movements_product_time_idx" ON "stock_movements" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_idx" ON "stock_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_reason_idx" ON "stock_movements" USING btree ("reason","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "products_reference_unique" ON "products" USING btree ("reference") WHERE "products"."deleted_at" IS NULL AND "products"."reference" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "products_ean13_idx" ON "products" USING btree ("ean13");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("product_type","deleted_at");