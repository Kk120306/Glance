import { pgTable, uuid, text, boolean, timestamp, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceToken: uuid('device_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const familyMembers = pgTable('family_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => familyMembers.id),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => patients.id),
    content: text('content').notNull(),
    isYesNo: boolean('is_yes_no').notNull().default(false),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('content_length', sql`char_length(${table.content}) BETWEEN 1 AND 1000`),
  ],
)

export type Patient = typeof patients.$inferSelect
export type NewPatient = typeof patients.$inferInsert
export type FamilyMember = typeof familyMembers.$inferSelect
export type NewFamilyMember = typeof familyMembers.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
