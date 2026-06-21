/**
 * Base URL of the patient (gaze) app. Overridable per-deployment via
 * NEXT_PUBLIC_PATIENT_APP_URL; defaults to the local dev port (3000).
 */
const PATIENT_APP_BASE =
  process.env.NEXT_PUBLIC_PATIENT_APP_URL ?? 'http://localhost:3000'

/**
 * Build the setup link that pairs a device to a specific patient. Opening it
 * lets the patient middleware validate the token and pin it into a cookie, so a
 * caregiver can jump straight to what their loved one sees on screen.
 */
export function patientAppUrl(deviceToken: string): string {
  return `${PATIENT_APP_BASE}/?token=${encodeURIComponent(deviceToken)}`
}
