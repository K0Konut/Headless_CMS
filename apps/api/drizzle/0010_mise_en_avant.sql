ALTER TABLE "content_types" ADD COLUMN "featuring" jsonb;--> statement-breakpoint
CREATE INDEX "events_space_path_idx" ON "events" USING btree ("space_id","path");