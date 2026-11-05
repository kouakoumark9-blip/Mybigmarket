CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"level" varchar(10) DEFAULT 'error' NOT NULL,
	"source" varchar(20) NOT NULL,
	"code" varchar(60),
	"message" text NOT NULL,
	"stack" text,
	"fingerprint" varchar(64) NOT NULL,
	"request_id" varchar(80),
	"method" varchar(10),
	"path" varchar(500),
	"route" varchar(120),
	"status" integer,
	"actor" varchar(120),
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_employee_id" uuid
);
--> statement-breakpoint
CREATE TABLE "import_job_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"line" integer NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"planned_action" varchar(10) NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entity_id" varchar(64),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"entity" varchar(30) NOT NULL,
	"status" varchar(16) DEFAULT 'simulated' NOT NULL,
	"file_name" varchar(200),
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_by_employee_id" uuid,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_code" varchar(60) NOT NULL,
	"trigger" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"result" jsonb,
	"error" text,
	"triggered_by_employee_id" uuid
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"code" varchar(60) PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"locked_until" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" varchar(12),
	"last_duration_ms" integer,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_daily" (
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"day" date NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"valid_orders_count" integer DEFAULT 0 NOT NULL,
	"revenue_xof" bigint DEFAULT 0 NOT NULL,
	"shipping_xof" bigint DEFAULT 0 NOT NULL,
	"items_sold" integer DEFAULT 0 NOT NULL,
	"cancelled_count" integer DEFAULT 0 NOT NULL,
	"refunded_xof" bigint DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"buyers_count" integer DEFAULT 0 NOT NULL,
	"carts_created" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stats_daily_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"day" date NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid,
	"category_id" integer,
	"units" integer DEFAULT 0 NOT NULL,
	"revenue_xof" bigint DEFAULT 0 NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_resolved_by_employee_id_employees_id_fk" FOREIGN KEY ("resolved_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_employee_id_employees_id_fk" FOREIGN KEY ("created_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_task_runs" ADD CONSTRAINT "scheduled_task_runs_triggered_by_employee_id_employees_id_fk" FOREIGN KEY ("triggered_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_daily" ADD CONSTRAINT "stats_daily_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_daily_products" ADD CONSTRAINT "stats_daily_products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_daily_products" ADD CONSTRAINT "stats_daily_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_daily_products" ADD CONSTRAINT "stats_daily_products_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stats_daily_products" ADD CONSTRAINT "stats_daily_products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "error_logs_time_idx" ON "error_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "error_logs_fingerprint_idx" ON "error_logs" USING btree ("fingerprint","occurred_at");--> statement-breakpoint
CREATE INDEX "error_logs_open_idx" ON "error_logs" USING btree ("resolved_at","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "import_job_rows_job_line_unique" ON "import_job_rows" USING btree ("job_id","line");--> statement-breakpoint
CREATE INDEX "import_job_rows_job_status_idx" ON "import_job_rows" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "import_jobs_shop_created_idx" ON "import_jobs" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_task_runs_task_time_idx" ON "scheduled_task_runs" USING btree ("task_code","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stats_daily_shop_day_unique" ON "stats_daily" USING btree ("shop_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "stats_daily_products_unique" ON "stats_daily_products" USING btree ("shop_id","day","product_id");--> statement-breakpoint
CREATE INDEX "stats_daily_products_product_idx" ON "stats_daily_products" USING btree ("product_id","day");