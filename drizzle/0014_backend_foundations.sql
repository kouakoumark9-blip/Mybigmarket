CREATE TYPE "public"."domain_event_status" AS ENUM('pending', 'dispatched', 'failed');--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"name" varchar(80) NOT NULL,
	"aggregate_type" varchar(60),
	"aggregate_id" varchar(100),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "domain_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(120) NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'processing' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(160) NOT NULL,
	"domain" varchar(190),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
INSERT INTO "shops" ("id", "code", "name", "is_default", "is_active") VALUES ('00000000-0000-4000-8000-000000000001', 'default', 'mybigmarket', true, true) ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "shop_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "actor_type" varchar(20) DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "shop_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "before_state" jsonb;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "after_state" jsonb;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "changed_fields" jsonb;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "employee_sessions" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_sessions" ADD COLUMN "replaced_by_session_id" uuid;--> statement-breakpoint
ALTER TABLE "employee_sessions" ADD COLUMN "revoked_reason" varchar(40);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_events_queue_idx" ON "domain_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "domain_events_name_time_idx" ON "domain_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_aggregate_idx" ON "domain_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_key_unique" ON "idempotency_keys" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_code_unique" ON "shops" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_domain_unique" ON "shops" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "shops_active_idx" ON "shops" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD CONSTRAINT "employee_audit_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD CONSTRAINT "employee_audit_logs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_audit_action_time_idx" ON "employee_audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "employee_audit_time_idx" ON "employee_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "employee_sessions_family_idx" ON "employee_sessions" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "employees_deleted_idx" ON "employees" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_shop_key_unique" ON "settings" USING btree ("shop_id","key");--> statement-breakpoint
DROP INDEX "settings_key_unique";--> statement-breakpoint
UPDATE "employee_sessions" SET "family_id" = "id" WHERE "family_id" IS NULL;
