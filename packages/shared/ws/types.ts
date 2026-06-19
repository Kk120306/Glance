import type { Message } from '../db/schema'

export type CameraSchedule = {
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string
}

export type ServerToClientMessage =
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'MESSAGE_READ'; payload: { id: string } }
  | { type: 'CAMERA_CONFIG_UPDATE'; payload: { cameraOverrideActive: boolean; schedules: CameraSchedule[] } }
  | { type: 'SOS_TRIGGERED'; payload: { patientId: string; timestamp: string } }
  | { type: 'NEW_REPLY'; payload: { messageId: string; reply: 'yes' | 'no'; repliedAt: string } }

export type ClientToServerMessage =
  | { type: 'REGISTER'; role: 'patient'; patientId: string }
  | { type: 'REGISTER'; role: 'caregiver'; familyMemberId: string }

export type EmitRequest = {
  targetPatientId?: string
  targetFamilyMemberId?: string
  event: ServerToClientMessage
}
