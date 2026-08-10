DROP TABLE "sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "verify_token";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "verify_token_expiry";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "reset_token";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "reset_token_expiry";