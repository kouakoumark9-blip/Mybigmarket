CREATE TYPE "public"."attribute_display_type" AS ENUM('color', 'texture', 'select', 'radio');--> statement-breakpoint
CREATE TYPE "public"."module_hook_status" AS ENUM('idle', 'ok', 'error');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "feature_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_id" uuid NOT NULL,
	"value" varchar(190) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"label" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "module_hooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"hook_code" varchar(80) NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "product_combination_attributes" (
	"id" serial PRIMARY KEY NOT NULL,
	"variant_id" integer NOT NULL,
	"attribute_value_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_feature_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"feature_value_id" uuid,
	"custom_value" varchar(190)
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" varchar(40) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"field" varchar(40) NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "before_state" jsonb;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "after_state" jsonb;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD COLUMN "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "meta_title" varchar(190);--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "meta_description" varchar(320);--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "meta_title" varchar(190);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "meta_description" varchar(320);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "ean13" varchar(13);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "upc" varchar(12);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "weight_impact_grams" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "minimum_quantity" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "combination_key" varchar(64);--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "contact_email" varchar(190);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_values" ADD CONSTRAINT "attribute_values_group_id_attribute_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."attribute_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_values" ADD CONSTRAINT "feature_values_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_hooks" ADD CONSTRAINT "module_hooks_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_hooks" ADD CONSTRAINT "module_hooks_hook_code_hooks_code_fk" FOREIGN KEY ("hook_code") REFERENCES "public"."hooks"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_combination_attributes" ADD CONSTRAINT "product_combination_attributes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_combination_attributes" ADD CONSTRAINT "product_combination_attributes_attribute_value_id_attribute_values_id_fk" FOREIGN KEY ("attribute_value_id") REFERENCES "public"."attribute_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feature_values" ADD CONSTRAINT "product_feature_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feature_values" ADD CONSTRAINT "product_feature_values_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_feature_values" ADD CONSTRAINT "product_feature_values_feature_value_id_feature_values_id_fk" FOREIGN KEY ("feature_value_id") REFERENCES "public"."feature_values"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_active_idx" ON "api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_groups_code_unique" ON "attribute_groups" USING btree ("code");--> statement-breakpoint
CREATE INDEX "attribute_groups_active_position_idx" ON "attribute_groups" USING btree ("is_active","position");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_values_group_code_unique" ON "attribute_values" USING btree ("group_id","code");--> statement-breakpoint
CREATE INDEX "attribute_values_group_position_idx" ON "attribute_values" USING btree ("group_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_values_feature_value_unique" ON "feature_values" USING btree ("feature_id","value");--> statement-breakpoint
CREATE INDEX "feature_values_feature_position_idx" ON "feature_values" USING btree ("feature_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "features_code_unique" ON "features" USING btree ("code");--> statement-breakpoint
CREATE INDEX "features_active_position_idx" ON "features" USING btree ("is_active","position");--> statement-breakpoint
CREATE UNIQUE INDEX "hooks_code_unique" ON "hooks" USING btree ("code");--> statement-breakpoint
CREATE INDEX "module_events_log_hook_idx" ON "module_events_log" USING btree ("hook_code","executed_at");--> statement-breakpoint
CREATE INDEX "module_events_log_module_idx" ON "module_events_log" USING btree ("module_code","executed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "module_hooks_unique" ON "module_hooks" USING btree ("module_id","hook_code");--> statement-breakpoint
CREATE INDEX "module_hooks_lookup_idx" ON "module_hooks" USING btree ("hook_code","is_active","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "modules_code_unique" ON "modules" USING btree ("code");--> statement-breakpoint
CREATE INDEX "modules_active_idx" ON "modules" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "product_combination_attributes_unique" ON "product_combination_attributes" USING btree ("variant_id","attribute_value_id");--> statement-breakpoint
CREATE INDEX "product_combination_attributes_value_idx" ON "product_combination_attributes" USING btree ("attribute_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_feature_values_unique" ON "product_feature_values" USING btree ("product_id","feature_id");--> statement-breakpoint
CREATE INDEX "product_feature_values_feature_idx" ON "product_feature_values" USING btree ("feature_id","feature_value_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translations_unique" ON "translations" USING btree ("entity","entity_id","locale","field");--> statement-breakpoint
CREATE INDEX "translations_lookup_idx" ON "translations" USING btree ("entity","entity_id","locale");--> statement-breakpoint
CREATE INDEX "products_trash_idx" ON "products" USING btree ("deleted_at","status");
--> statement-breakpoint
CREATE INDEX "products_position_idx" ON "products" USING btree ("position");
--> statement-breakpoint
CREATE INDEX "categories_trash_idx" ON "categories" USING btree ("deleted_at","is_active");
--> statement-breakpoint
CREATE INDEX "brands_trash_idx" ON "brands" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "suppliers_trash_idx" ON "suppliers" USING btree ("deleted_at");
--> statement-breakpoint
CREATE INDEX "users_trash_idx" ON "users" USING btree ("deleted_at","status");
--> statement-breakpoint
CREATE INDEX "orders_reference_idx" ON "orders" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "orders_trash_idx" ON "orders" USING btree ("deleted_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_combination_key_idx" ON "product_variants" USING btree ("product_id","combination_key") WHERE "combination_key" IS NOT NULL;
