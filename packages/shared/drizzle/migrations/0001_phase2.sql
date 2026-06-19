ALTER TABLE "patients" ADD COLUMN "camera_override_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "elevenlabs_voice_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tone_class" text DEFAULT 'neutral' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "valid_reply" CHECK ("messages"."reply" IN ('yes', 'no') OR "messages"."reply" IS NULL);--> statement-breakpoint
CREATE TABLE "camera_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "camera_schedules" ADD CONSTRAINT "camera_schedules_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
