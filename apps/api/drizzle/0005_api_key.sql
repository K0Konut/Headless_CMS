ALTER TABLE "spaces" ADD COLUMN "api_key_hash" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "api_key_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_api_key_hash_unique" UNIQUE("api_key_hash");