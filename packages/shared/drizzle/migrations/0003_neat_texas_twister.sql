CREATE TABLE "patient_caregivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"family_member_id" uuid NOT NULL,
	"role" text DEFAULT 'caregiver' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_patient_caregiver" UNIQUE("patient_id","family_member_id"),
	CONSTRAINT "valid_role" CHECK ("patient_caregivers"."role" IN ('primary_caregiver', 'caregiver'))
);
--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "name" text DEFAULT 'New Patient' NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_caregivers" ADD CONSTRAINT "patient_caregivers_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_caregivers" ADD CONSTRAINT "patient_caregivers_family_member_id_family_members_id_fk" FOREIGN KEY ("family_member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;