import type { Message } from '../db/schema'

export type CameraSchedule = {
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string
}

export type ServerToClientMessage =
  // `senderName` is the resolved display name for the message (persona name when
  // sent as a persona, otherwise the family member's name). Optional so older
  // emitters and patient-initiated messages (which carry no sender name) stay valid.
  | { type: 'NEW_MESSAGE'; payload: Message & { senderName?: string | null } }
  | { type: 'MESSAGE_READ'; payload: { id: string; patientId?: string } }
  | { type: 'CAMERA_CONFIG_UPDATE'; payload: { cameraOverrideActive: boolean; schedules: CameraSchedule[] } }
  | { type: 'SOS_TRIGGERED'; payload: { patientId: string; timestamp: string } }
  | { type: 'NEW_REPLY'; payload: { messageId: string; reply: 'yes' | 'no'; repliedAt: string } }
  | { type: 'PATIENT_STATUS_CHANGE'; payload: { patientId: string; status: 'online' | 'offline' } }

export type ClientToServerMessage =
  | { type: 'REGISTER'; role: 'patient'; patientId: string }
  | { type: 'REGISTER'; role: 'caregiver'; familyMemberId: string; patientIds: string[] }

export type EmitRequest = {
  /** Route to the patient device room `patient:<id>` (e.g. incoming family message, camera config). */
  targetPatientId?: string
  /** Route to a single caregiver room `caregiver:<id>`. */
  targetFamilyMemberId?: string
  /** Route to the caregiver alerts room `patient:alerts:<id>` — every caregiver linked to the patient. */
  targetPatientAlerts?: string
  event: ServerToClientMessage
}
