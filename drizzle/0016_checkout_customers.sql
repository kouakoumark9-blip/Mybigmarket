ALTER TABLE "carts" ADD COLUMN "voucher_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_group_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "applied_vouchers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_checkout_group_idx" ON "orders" USING btree ("checkout_group_id");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
-- Rattache les commandes existantes au profil client de l'acheteur, quand il existe.
UPDATE "orders" o SET "customer_id" = c."id" FROM "customers" c WHERE c."user_id" = o."buyer_id" AND o."customer_id" IS NULL;
