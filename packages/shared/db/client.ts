import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is required')
  const client = postgres(url, { max: 10 })
  return drizzle(client, { schema })
}

export const db = getDb()
export type DB = typeof db
