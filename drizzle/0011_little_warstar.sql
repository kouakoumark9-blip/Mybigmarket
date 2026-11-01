CREATE TYPE "public"."billable_basis" AS ENUM('weight', 'volume', 'both');--> statement-breakpoint
CREATE TYPE "public"."transit_unit" AS ENUM('days', 'weeks');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "billable_basis" "billable_basis" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "free_above_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "free_above_weight_grams" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "out_of_range_behavior" varchar(20) DEFAULT 'disable' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "max_package_weight_grams" integer DEFAULT 30000 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "max_package_length_cm" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "delivery_time_label" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "tracking_url_pattern" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "label" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "handling_fee_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "customs_fee_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "transit_days_min" integer;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "transit_days_max" integer;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "valid_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "valid_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "region_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "city_names" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_discount_tiers" ADD CONSTRAINT "shipping_discount_tiers_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_discount_tiers" ADD CONSTRAINT "shipping_discount_tiers_shipping_zone_id_shipping_zones_id_fk" FOREIGN KEY ("shipping_zone_id") REFERENCES "public"."shipping_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipping_discount_tiers_lookup_idx" ON "shipping_discount_tiers" USING btree ("shipping_method_id","shipping_zone_id","sort_order");--> statement-breakpoint
CREATE INDEX "shipping_quotes_fingerprint_idx" ON "shipping_quotes" USING btree ("cart_fingerprint","created_at");--> statement-breakpoint
CREATE INDEX "shipping_quotes_expires_idx" ON "shipping_quotes" USING btree ("expires_at");