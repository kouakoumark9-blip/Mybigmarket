CREATE TABLE "customer_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" varchar(40) NOT NULL,
	"granted" boolean NOT NULL,
	"source" varchar(40) DEFAULT 'admin' NOT NULL,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_group_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_group_payment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_group_id" integer NOT NULL,
	"payment_method_code" varchar(40) NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "phone_normalized" varchar(24) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "delivery_instructions" varchar(240);--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "is_default_return" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "price_display_method" varchar(16) DEFAULT 'tax_excluded' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "show_prices" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "segment" varchar(24) DEFAULT 'individual' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "preferred_language" varchar(5) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "newsletter_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "newsletter_opt_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "internal_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_payment_rules" ADD CONSTRAINT "customer_group_payment_rules_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_consents_customer_purpose_idx" ON "customer_consents" USING btree ("customer_id","purpose","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_members_unique" ON "customer_group_members" USING btree ("customer_id","customer_group_id");--> statement-breakpoint
CREATE INDEX "customer_group_members_group_idx" ON "customer_group_members" USING btree ("customer_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_members_one_primary" ON "customer_group_members" USING btree ("customer_id") WHERE "customer_group_members"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_payment_rules_unique" ON "customer_group_payment_rules" USING btree ("customer_group_id","payment_method_code");--> statement-breakpoint
CREATE INDEX "addresses_active_idx" ON "addresses" USING btree ("customer_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_shipping" ON "addresses" USING btree ("customer_id") WHERE "addresses"."is_default_shipping" = true AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_one_default_billing" ON "addresses" USING btree ("customer_id") WHERE "addresses"."is_default_billing" = true AND "addresses"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_groups_one_default" ON "customer_groups" USING btree ("is_default") WHERE "customer_groups"."is_default" = true AND "customer_groups"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "customers_group_fk_idx" ON "customers" USING btree ("customer_group_id");--> statement-breakpoint
CREATE INDEX "customers_segment_idx" ON "customers" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "customers_activity_idx" ON "customers" USING btree ("last_activity_at");