ALTER TABLE "entries" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_deleted_at_idx" ON "entries" USING btree ("deleted_at") WHERE "entries"."deleted_at" is not null;