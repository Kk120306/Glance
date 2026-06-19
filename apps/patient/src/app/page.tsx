import { PatientScreen } from '@/components/PatientScreen'

export const dynamic = 'force-dynamic'

export default function PatientPage() {
  const wsServerUrl = process.env.WS_SERVER_URL ?? 'http://localhost:4000'
  const displaySeconds = Number(process.env.MESSAGE_DISPLAY_SECONDS ?? 30)
  const deviceToken = process.env.PATIENT_DEVICE_TOKEN ?? ''

  return <PatientScreen wsServerUrl={wsServerUrl} displaySeconds={displaySeconds} deviceToken={deviceToken} />
}
