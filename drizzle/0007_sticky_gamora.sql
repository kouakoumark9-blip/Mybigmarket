CREATE TABLE "employee_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_employee_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(100),
	"details" jsonb,
	"ip_address" varchar(45),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_audit_logs" ADD CONSTRAINT "employee_audit_logs_actor_employee_id_employees_id_fk" FOREIGN KEY ("actor_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_audit_actor_time_idx" ON "employee_audit_logs" USING btree ("actor_employee_id","created_at");--> statement-breakpoint
CREATE INDEX "employee_audit_entity_idx" ON "employee_audit_logs" USING btree ("entity_type","entity_id");