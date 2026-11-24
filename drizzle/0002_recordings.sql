CREATE TYPE "public"."recording_status" AS ENUM('uploaded', 'transcribing', 'summarizing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" uuid,
	"customer_id" uuid,
	"file_name" text NOT NULL,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"duration_sec" integer,
	"contact_label" text,
	"contact_phone" text,
	"recorded_at" timestamp with time zone,
	"status" "recording_status" DEFAULT 'uploaded' NOT NULL,
	"error" text,
	"transcript" text,
	"summary" jsonb,
	"interaction_id" uuid,
	"needs_applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_interaction_id_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."interactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recordings_customer_idx" ON "recordings" USING btree ("customer_id","recorded_at");--> statement-breakpoint
CREATE INDEX "recordings_uploader_idx" ON "recordings" USING btree ("uploaded_by","created_at");