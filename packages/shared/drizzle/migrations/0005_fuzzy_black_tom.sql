ALTER TABLE "messages" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "valid_media_type" CHECK ("messages"."media_type" IN ('image', 'video') OR "messages"."media_type" IS NULL);