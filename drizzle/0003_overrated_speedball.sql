CREATE TYPE "public"."quote_request_kind" AS ENUM('product', 'sourcing');--> statement-breakpoint
CREATE TYPE "public"."quote_request_status" AS ENUM('new', 'in_review', 'quoted', 'closed');--> statement-breakpoint
CREATE TABLE "quote_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid,
	"product_id" uuid,
	"conversation_id" uuid,
	"kind" "quote_request_kind" NOT NULL,
	"status" "quote_request_status" DEFAULT 'new' NOT NULL,
	"product_title" varchar(190) NOT NULL,
	"quantity" integer NOT NULL,
	"destination" varchar(120) NOT NULL,
	"contact_phone" varchar(32) NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_requests_buyer_recent_idx" ON "quote_requests" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "quote_requests_seller_recent_idx" ON "quote_requests" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "quote_requests_status_recent_idx" ON "quote_requests" USING btree ("status","created_at");