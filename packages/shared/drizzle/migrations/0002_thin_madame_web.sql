ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_patient_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_patient_id_patients_id_fk" FOREIGN KEY ("sender_patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "valid_sender" CHECK (("messages"."sender_id" IS NOT NULL AND "messages"."sender_patient_id" IS NULL) OR ("messages"."sender_id" IS NULL AND "messages"."sender_patient_id" IS NOT NULL));
