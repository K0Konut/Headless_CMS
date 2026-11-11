CREATE TABLE "preview_links" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" uuid,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "preview_url" text;--> statement-breakpoint
ALTER TABLE "preview_links" ADD CONSTRAINT "preview_links_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;