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
--> statement-breakpoint
ALTER TABLE "seller_storefronts" ADD CONSTRAINT "seller_storefronts_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_storefronts_seller_unique" ON "seller_storefronts" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_storefronts_slug_unique" ON "seller_storefronts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "seller_storefronts_published_idx" ON "seller_storefronts" USING btree ("is_published","updated_at");