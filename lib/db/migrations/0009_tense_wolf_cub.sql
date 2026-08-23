CREATE TYPE "public"."lead_sequence_status" AS ENUM('active', 'processing', 'failed');--> statement-breakpoint
ALTER TABLE "lead_sequences" ADD COLUMN "status" "lead_sequence_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_sequences" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "lead_sequences" ADD COLUMN "claimed_at" timestamp with time zone;