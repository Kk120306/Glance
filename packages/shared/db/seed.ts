import { db } from './client'
import { patients } from './schema'

export async function seed() {
  const deviceToken = process.env.PATIENT_DEVICE_TOKEN
  if (!deviceToken) {
    console.error('PATIENT_DEVICE_TOKEN environment variable is required')
    process.exit(1)
  }

  await db.insert(patients).values({ deviceToken }).onConflictDoNothing()
  console.log('Seeded patient record with device token')
}
