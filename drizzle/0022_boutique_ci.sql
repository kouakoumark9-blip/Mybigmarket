CREATE TABLE "shop_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"title" varchar(190) NOT NULL,
	"unit_price_xof" integer NOT NULL,
	"quantity" integer NOT NULL,
	"availability_label" varchar(120) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(24) NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"phone" varchar(30) NOT NULL,
	"commune" varchar(80) NOT NULL,
	"address" text NOT NULL,
	"delivery_fee_xof" integer DEFAULT 0 NOT NULL,
	"subtotal_xof" integer NOT NULL,
	"total_xof" integer NOT NULL,
	"payment_method" varchar(30) DEFAULT 'cash_on_delivery' NOT NULL,
	"customer_note" text DEFAULT '' NOT NULL,
	"internal_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "intro_text" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "body_text" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "faq" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "compare_price_xof" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "availability" varchar(20) DEFAULT 'in_stock_abidjan' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "energy_class" varchar(4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "alibaba_url" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "import_fees_xof" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "power_label" varchar(40);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "badge" varchar(30);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_best_seller" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_order_items_order_idx" ON "shop_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shop_order_items_product_idx" ON "shop_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_orders_reference_unique" ON "shop_orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "shop_orders_status_created_idx" ON "shop_orders" USING btree ("status","created_at");