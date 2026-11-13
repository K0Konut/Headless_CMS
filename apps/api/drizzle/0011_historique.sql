CREATE TABLE "entry_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"scheduled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "entry_versions_entry_number" UNIQUE("entry_id","number")
);
--> statement-breakpoint
ALTER TABLE "entry_versions" ADD CONSTRAINT "entry_versions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_versions" ADD CONSTRAINT "entry_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Les entrées déjà publiées reçoivent leur version 1, datée de leur dernière publication, sans auteur.
INSERT INTO "entry_versions" ("entry_id", "number", "data", "published_at")
SELECT "id", 1, "published", coalesce("published_at", "updated_at") FROM "entries" WHERE "published" IS NOT NULL;
