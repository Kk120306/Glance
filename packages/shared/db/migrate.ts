import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'
import { fileURLToPath } from 'url'
import { seed } from './seed'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  const deviceToken = process.env.PATIENT_DEVICE_TOKEN
  if (!deviceToken) {
    console.error('PATIENT_DEVICE_TOKEN environment variable is required')
    process.exit(1)
  }

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  await migrate(db, {
    migrationsFolder: path.join(__dirname, '../drizzle/migrations'),
  })
  console.log('Migrations applied')

  await seed()

  await client.end()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
