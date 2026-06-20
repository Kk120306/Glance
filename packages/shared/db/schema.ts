import { pgTable, uuid, text, boolean, timestamp, integer, check, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceToken: uuid('device_token').notNull().unique().defaultRandom(),
  name: text('name').notNull().default('New Patient'),
  cameraOverrideActive: boolean('camera_override_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cameraSchedules = pgTable('camera_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const familyMembers = pgTable('family_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  elevenlabsVoiceId: text('elevenlabs_voice_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable: a message is sent by EITHER a family member OR the patient.
    senderId: uuid('sender_id').references(() => familyMembers.id),
    // Set when the patient initiates the message (e.g. a fixed-phrase request).
    senderPatientId: uuid('sender_patient_id').references(() => patients.id),
    recipientId: uuid('recipient_id').notNull().references(() => patients.id),
    content: text('content').notNull(),
    isYesNo: boolean('is_yes_no').notNull().default(false),
    isRead: boolean('is_read').notNull().default(false),
    toneClass: text('tone_class').notNull().default('neutral'),
    reply: text('reply'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('content_length', sql`char_length(${table.content}) BETWEEN 1 AND 1000`),
    check('valid_reply', sql`${table.reply} IN ('yes', 'no') OR ${table.reply} IS NULL`),
    // Invariant: exactly one sender (family member XOR patient) is populated.
    check(
      'valid_sender',
      sql`(${table.senderId} IS NOT NULL AND ${table.senderPatientId} IS NULL) OR (${table.senderId} IS NULL AND ${table.senderPatientId} IS NOT NULL)`,
    ),
  ],
)

export const patientCaregivers = pgTable(
  'patient_caregivers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    familyMemberId: uuid('family_member_id')
      .notNull()
      .references(() => familyMembers.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('caregiver'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('unique_patient_caregiver').on(table.patientId, table.familyMemberId),
    check('valid_role', sql`${table.role} IN ('primary_caregiver', 'caregiver')`),
  ],
)

export type Patient = typeof patients.$inferSelect
export type NewPatient = typeof patients.$inferInsert
export type CameraScheduleRow = typeof cameraSchedules.$inferSelect
export type NewCameraScheduleRow = typeof cameraSchedules.$inferInsert
export type FamilyMember = typeof familyMembers.$inferSelect
export type NewFamilyMember = typeof familyMembers.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type PatientCaregiver = typeof patientCaregivers.$inferSelect
export type NewPatientCaregiver = typeof patientCaregivers.$inferInsert

