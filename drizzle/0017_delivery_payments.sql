CREATE TYPE "public"."payment_intent_status" AS ENUM('pending', 'succeeded', 'failed', 'cancelled', 'expired');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'moov_money' BEFORE 'mock';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'cash_on_delivery' BEFORE 'mock';--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(40) NOT NULL,
	"checkout_group_id" uuid,
	"user_id" uuid,
	"customer_id" uuid,
	"method" "payment_method" NOT NULL,
	"provider" varchar(40) NOT NULL,
	"amount_xof" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'XOF' NOT NULL,
	"status" "payment_intent_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" varchar(190),
	"checkout_url" text,
	"instructions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"country_code" varchar(2),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"failure_reason" varchar(240),
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" uuid,
	"payment_id" uuid,
	"order_id" uuid,
	"refund_id" uuid,
	"kind" varchar(32) NOT NULL,
	"status" varchar(24) NOT NULL,
	"provider" varchar(40) NOT NULL,
	"provider_reference" varchar(190),
	"amount_xof" integer,
	"request" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"actor_type" varchar(20) DEFAULT 'system' NOT NULL,
	"actor_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"event_key" varchar(190) NOT NULL,
	"intent_id" uuid,
	"signature_valid" boolean NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"outcome" varchar(60),
	"payload_sha256" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "intent_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount_xof" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_reason" varchar(240);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "mode" "shipping_mode";--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "carrier_name" varchar(120);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "tracking_number" varchar(120);--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "expected_arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_reference_unique" ON "payment_intents" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_group_idx" ON "payment_intents" USING btree ("checkout_group_id");--> statement-breakpoint
CREATE INDEX "payment_intents_provider_ref_idx" ON "payment_intents" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payment_intents_user_idx" ON "payment_intents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_intent_idx" ON "payment_transactions" USING btree ("intent_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_order_idx" ON "payment_transactions" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_kind_idx" ON "payment_transactions" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_webhook_events_key_unique" ON "payment_webhook_events" USING btree ("provider","event_key");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_status_idx" ON "payment_webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "payment_webhook_events_intent_idx" ON "payment_webhook_events" USING btree ("intent_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_method_id_shipping_methods_id_fk" FOREIGN KEY ("shipping_method_id") REFERENCES "public"."shipping_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_intent_idx" ON "payments" USING btree ("intent_id");--> statement-breakpoint
-- Nouveaux moyens de paiement, désactivés par défaut : l'équipe les active quand le prestataire
-- (Moov Money) ou la logistique d'encaissement (paiement à la livraison) est prête.
INSERT INTO "payment_methods" ("code", "name", "provider", "is_active") VALUES
  ('moov_money', 'Moov Money', 'moov-money', false),
  ('cash_on_delivery', 'Paiement à la livraison', 'cash-on-delivery', false)
ON CONFLICT ("code") DO NOTHING;
