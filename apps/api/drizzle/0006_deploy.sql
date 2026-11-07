ALTER TABLE "spaces" ADD COLUMN "deploy_url" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deploy_token" text;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deploy_called_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deploy_status" integer;