CREATE TABLE "ai_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" varchar(64) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"proposal" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_changes" jsonb,
	"model" varchar(60),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"requested_by_employee_id" uuid,
	"decided_by_employee_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"employee_id" uuid,
	"proposal_id" uuid,
	"kind" varchar(30) NOT NULL,
	"model" varchar(60),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" uuid NOT NULL,
	"shop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_reply_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"code" varchar(60) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"category" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_type" varchar(12) NOT NULL,
	"user_id" uuid,
	"employee_id" uuid,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"ai_proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001'::uuid NOT NULL,
	"reference" varchar(30) NOT NULL,
	"customer_id" uuid,
	"user_id" uuid,
	"email" varchar(190) NOT NULL,
	"name" varchar(160) DEFAULT '' NOT NULL,
	"subject" varchar(200) NOT NULL,
	"category" varchar(30) DEFAULT 'other' NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"channel" varchar(20) DEFAULT 'web' NOT NULL,
	"assigned_employee_id" uuid,
	"order_id" uuid,
	"product_id" uuid,
	"form_submission_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_response_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_customer_message_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"satisfaction_score" integer,
	"satisfaction_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_requested_by_employee_id_employees_id_fk" FOREIGN KEY ("requested_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_decided_by_employee_id_employees_id_fk" FOREIGN KEY ("decided_by_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_proposal_id_ai_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."ai_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shops" ADD CONSTRAINT "employee_shops_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shops" ADD CONSTRAINT "employee_shops_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_reply_templates" ADD CONSTRAINT "support_reply_templates_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_form_submission_id_form_submissions_id_fk" FOREIGN KEY ("form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_proposals_queue_idx" ON "ai_proposals" USING btree ("shop_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ai_proposals_target_idx" ON "ai_proposals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ai_proposals_requester_idx" ON "ai_proposals" USING btree ("requested_by_employee_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_employee_time_idx" ON "ai_usage" USING btree ("employee_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_shop_time_idx" ON "ai_usage" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_shops_unique" ON "employee_shops" USING btree ("employee_id","shop_id");--> statement-breakpoint
CREATE INDEX "employee_shops_shop_idx" ON "employee_shops" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_reply_templates_shop_code_unique" ON "support_reply_templates" USING btree ("shop_id","code");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_reference_unique" ON "support_tickets" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_form_submission_unique" ON "support_tickets" USING btree ("form_submission_id") WHERE "support_tickets"."form_submission_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "support_tickets_queue_idx" ON "support_tickets" USING btree ("shop_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "support_tickets_assignee_idx" ON "support_tickets" USING btree ("assigned_employee_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "support_tickets_email_idx" ON "support_tickets" USING btree ("email");--> statement-breakpoint
-- Modèles de réponse livrés prêts à l'emploi (modifiables dans l'administration).
INSERT INTO "support_reply_templates" ("code", "title", "body", "category", "position") VALUES
('accuse-reception', 'Accusé de réception', 'Bonjour {{customerName}},

Nous avons bien reçu votre demande {{ticketReference}} et nous la traitons. Vous recevrez une réponse dans les meilleurs délais.

Bien cordialement,
{{agentName}} — service client {{storeName}}', NULL, 0),
('commande-en-preparation', 'Commande en préparation', 'Bonjour {{customerName}},

Votre commande {{orderReference}} est en cours de préparation chez le vendeur. Vous serez averti par e-mail dès son expédition, avec le lien de suivi.

Bien cordialement,
{{agentName}} — service client {{storeName}}', 'order', 1),
('suivi-livraison', 'Suivi de livraison', 'Bonjour {{customerName}},

Votre commande {{orderReference}} est en route. Vous pouvez suivre son acheminement depuis votre espace client, rubrique « Mes commandes ».

Bien cordialement,
{{agentName}} — service client {{storeName}}', 'delivery', 2),
('remboursement-en-cours', 'Remboursement en cours', 'Bonjour {{customerName}},

Le remboursement de votre commande {{orderReference}} a été lancé. Selon votre moyen de paiement, il apparaît sous quelques jours ouvrés.

Bien cordialement,
{{agentName}} — service client {{storeName}}', 'payment', 3),
('cloture', 'Clôture de la demande', 'Bonjour {{customerName}},

Nous considérons votre demande {{ticketReference}} comme résolue. Si besoin, répondez simplement à ce message pour la rouvrir.

Bien cordialement,
{{agentName}} — service client {{storeName}}', NULL, 4)
ON CONFLICT ("shop_id", "code") DO NOTHING;
