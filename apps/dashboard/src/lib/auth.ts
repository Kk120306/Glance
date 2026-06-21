import { betterAuth } from 'better-auth'
import { Pool } from 'pg'
import { db } from '@glance/shared/db'
import { familyMembers } from '@glance/shared/db/schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db
            .insert(familyMembers)
            .values({
              email: user.email,
              name: user.name,
              // Auth is managed by better-auth; this field is legacy.
              passwordHash: '',
            })
            .onConflictDoNothing()
        },
      },
    },
  },
})

export type Auth = typeof auth
