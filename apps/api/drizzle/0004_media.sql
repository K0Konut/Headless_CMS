CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"original_name" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_image_size" CHECK (("media"."kind" = 'image') = ("media"."width" is not null and "media"."height" is not null))
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_space_created_idx" ON "media" USING btree ("space_id","created_at");