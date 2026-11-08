ALTER TABLE "entries" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "scheduled_version" integer;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "last_schedule" jsonb;--> statement-breakpoint
CREATE INDEX "entries_scheduled_at_idx" ON "entries" USING btree ("scheduled_at") WHERE "entries"."scheduled_at" is not null;