CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"email" varchar(190),
	"user_id" uuid,
	"ip_hash" varchar(64),
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notify_email" varchar(190),
	"success_message" varchar(400) DEFAULT 'Merci, votre message a bien été envoyé.' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer NOT NULL,
	"parent_id" integer,
	"label" varchar(120) NOT NULL,
	"link_type" varchar(20) NOT NULL,
	"target" varchar(300) DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"opens_new_tab" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" varchar(20) NOT NULL,
	"to_address" varchar(40) NOT NULL,
	"template_code" varchar(60),
	"locale" varchar(5) DEFAULT 'fr' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" varchar(190),
	"dedupe_key" varchar(190),
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "placement" varchar(40) DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD COLUMN "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD COLUMN "excerpt" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_pages" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "dedupe_key" varchar(190);--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "locale" varchar(5) DEFAULT 'fr' NOT NULL;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD COLUMN "status_code" integer DEFAULT 301 NOT NULL;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD COLUMN "hits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD COLUMN "last_hit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD COLUMN "note" varchar(240) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "slug_redirects" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_menu_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "form_submissions_status_idx" ON "form_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "forms_code_unique" ON "forms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "menu_items_menu_idx" ON "menu_items" USING btree ("menu_id","parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_code_unique" ON "menus" USING btree ("code");--> statement-breakpoint
CREATE INDEX "outbound_messages_status_idx" ON "outbound_messages" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_messages_dedupe_unique" ON "outbound_messages" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "email_queue_dedupe_unique" ON "email_queue" USING btree ("dedupe_key");--> statement-breakpoint
-- Recherche (étape 6) : extensions « de confiance » de PostgreSQL, installables par le propriétaire de la base.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- unaccent() est STABLE ; cette enveloppe IMMUTABLE (dictionnaire fixé) permet de l'indexer.
CREATE OR REPLACE FUNCTION public.mbm_unaccent(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS 'SELECT public.unaccent(''public.unaccent''::regdictionary, value)';--> statement-breakpoint
-- Document de recherche d'un produit : titre et référence (poids A), résumé (B), description (C), en français sans accents.
CREATE OR REPLACE FUNCTION public.mbm_product_document(title text, reference text, short_description text, description text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS 'SELECT setweight(to_tsvector(''french'', public.mbm_unaccent(coalesce(title, ''''))), ''A'')
          || setweight(to_tsvector(''simple'', public.mbm_unaccent(coalesce(reference, ''''))), ''A'')
          || setweight(to_tsvector(''french'', public.mbm_unaccent(coalesce(short_description, ''''))), ''B'')
          || setweight(to_tsvector(''french'', public.mbm_unaccent(left(coalesce(description, ''''), 20000))), ''C'')';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_document_idx" ON "products" USING gin (public.mbm_product_document("title", "reference", "short_description", "description"));--> statement-breakpoint
-- Tolérance aux fautes de frappe : trigrammes sur le titre sans accents.
CREATE INDEX IF NOT EXISTS "products_title_trgm_idx" ON "products" USING gin (public.mbm_unaccent(lower("title")) gin_trgm_ops);--> statement-breakpoint
-- Formulaire de contact livré prêt à l'emploi (modifiable dans l'administration).
INSERT INTO "forms" ("code", "title", "description", "fields") VALUES ('contact', 'Nous contacter', 'Une question sur une commande, un fournisseur ou une livraison ? Écrivez-nous.',
  '[{"name":"name","label":"Nom","type":"text","required":true,"maxLength":160},{"name":"email","label":"E-mail","type":"email","required":true,"maxLength":190},{"name":"phone","label":"Téléphone","type":"tel","required":false,"maxLength":32},{"name":"subject","label":"Sujet","type":"select","required":true,"options":["Commande","Paiement","Livraison","Devenir vendeur","Autre"]},{"name":"orderReference","label":"Référence de commande","type":"text","required":false,"maxLength":40},{"name":"message","label":"Message","type":"textarea","required":true,"maxLength":4000}]'::jsonb)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
-- Menu de pied de page reprenant les pages existantes de la boutique.
INSERT INTO "menus" ("code", "name") VALUES ('footer', 'Pied de page'), ('header', 'En-tête') ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "menu_items" ("menu_id", "label", "link_type", "target", "position")
SELECT m.id, v.label, 'url', v.target, v.position FROM "menus" m
CROSS JOIN (VALUES ('Comment ça marche', '/comment-ca-marche', 0), ('Demande de devis', '/demande-de-devis', 1), ('Conditions générales', '/conditions', 2), ('Confidentialité', '/confidentialite', 3)) AS v(label, target, position)
WHERE m.code = 'footer' AND NOT EXISTS (SELECT 1 FROM "menu_items" i WHERE i.menu_id = m.id);
