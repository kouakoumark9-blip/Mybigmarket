CREATE TYPE "public"."address_format_hint" AS ENUM('standard', 'postal_then_city', 'city_then_postal', 'no_postal');--> statement-breakpoint
CREATE TYPE "public"."email_queue_status" AS ENUM('pending', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."email_template_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "languages" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(5) NOT NULL,
	"name" varchar(60) NOT NULL,
	"locale" varchar(10) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"iso_code" varchar(8),
	"shipping_zone_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rule_group_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_rule_group_id" uuid NOT NULL,
	"tax_rule_id" uuid NOT NULL,
	"country_code" varchar(2),
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rule_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_rule_group_id" uuid;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_queue_id_email_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."email_queue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_employee_id_employees_id_fk" FOREIGN KEY ("updated_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "states" ADD CONSTRAINT "states_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_group_rules" ADD CONSTRAINT "tax_rule_group_rules_tax_rule_group_id_tax_rule_groups_id_fk" FOREIGN KEY ("tax_rule_group_id") REFERENCES "public"."tax_rule_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rule_group_rules" ADD CONSTRAINT "tax_rule_group_rules_tax_rule_id_tax_rules_id_fk" FOREIGN KEY ("tax_rule_id") REFERENCES "public"."tax_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "countries_iso2_unique" ON "countries" USING btree ("iso2");--> statement-breakpoint
CREATE INDEX "countries_active_position_idx" ON "countries" USING btree ("is_active","position");--> statement-breakpoint
CREATE INDEX "countries_zone_idx" ON "countries" USING btree ("shipping_zone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_code_unique" ON "currencies" USING btree ("code");--> statement-breakpoint
CREATE INDEX "currencies_default_idx" ON "currencies" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "email_log_created_idx" ON "email_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_log_status_idx" ON "email_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_queue_status_schedule_idx" ON "email_queue" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "email_queue_created_idx" ON "email_queue" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_code_locale_unique" ON "email_templates" USING btree ("code","locale");--> statement-breakpoint
CREATE INDEX "email_templates_active_idx" ON "email_templates" USING btree ("is_active","code");--> statement-breakpoint
CREATE UNIQUE INDEX "languages_code_unique" ON "languages" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "states_country_name_unique" ON "states" USING btree ("country_id","name");--> statement-breakpoint
CREATE INDEX "states_country_active_idx" ON "states" USING btree ("country_id","is_active");--> statement-breakpoint
CREATE INDEX "tax_rule_group_rules_group_idx" ON "tax_rule_group_rules" USING btree ("tax_rule_group_id","country_code");--> statement-breakpoint
CREATE INDEX "tax_rule_group_rules_rule_idx" ON "tax_rule_group_rules" USING btree ("tax_rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rule_groups_name_unique" ON "tax_rule_groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "tax_rule_groups_active_idx" ON "tax_rule_groups" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tax_rule_group_id_tax_rule_groups_id_fk" FOREIGN KEY ("tax_rule_group_id") REFERENCES "public"."tax_rule_groups"("id") ON DELETE set null ON UPDATE no action;