import { cookies } from 'next/headers'
import { PatientScreen } from '@/components/PatientScreen'

export const dynamic = 'force-dynamic'

export default async function PatientPage() {
  const wsServerUrl = process.env.WS_SERVER_URL ?? 'http://localhost:4000'
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3001'
  const displaySeconds = Number(process.env.MESSAGE_DISPLAY_SECONDS ?? 30)
  // Use the token the device was paired with (set by middleware on the setup
  // link), falling back to the static env token for single-device deployments.
  const cookieStore = await cookies()
  const deviceToken =
    cookieStore.get('x-device-token')?.value ?? process.env.PATIENT_DEVICE_TOKEN ?? ''

  return (
    <PatientScreen
      wsServerUrl={wsServerUrl}
      dashboardUrl={dashboardUrl}
      displaySeconds={displaySeconds}
      deviceToken={deviceToken}
    />
  )
}
