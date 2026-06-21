import { describe, it, expect } from 'vitest'
import type {
  ServerToClientMessage,
  ClientToServerMessage,
  EmitRequest,
  CameraSchedule,
} from '../ws/types'

function isNewMessage(msg: ServerToClientMessage): msg is Extract<ServerToClientMessage, { type: 'NEW_MESSAGE' }> {
  return msg.type === 'NEW_MESSAGE'
}

function isMessageRead(msg: ServerToClientMessage): msg is Extract<ServerToClientMessage, { type: 'MESSAGE_READ' }> {
  return msg.type === 'MESSAGE_READ'
}

describe('WebSocket envelope type guards', () => {
  it('identifies NEW_MESSAGE envelope', () => {
    const msg: ServerToClientMessage = {
      type: 'NEW_MESSAGE',
      payload: {
        id: 'uuid-1',
        senderId: 'sender-uuid',
        senderPatientId: null,
        recipientId: 'patient-uuid',
        content: 'Hello',
        isYesNo: false,
        isRead: false,
        toneClass: 'neutral',
        reply: null,
        repliedAt: null,
        createdAt: new Date(),
      },
    }
    expect(isNewMessage(msg)).toBe(true)
    expect(isMessageRead(msg)).toBe(false)
  })

  it('identifies MESSAGE_READ envelope', () => {
    const msg: ServerToClientMessage = {
      type: 'MESSAGE_READ',
      payload: { id: 'uuid-2' },
    }
    expect(isMessageRead(msg)).toBe(true)
    expect(isNewMessage(msg)).toBe(false)
  })

  it('identifies CAMERA_CONFIG_UPDATE envelope', () => {
    const schedule: CameraSchedule = {
      dayOfWeek: 1,
      startTime: '09:00',
      endTime: '17:00',
      timezone: 'America/New_York',
    }
    const msg: ServerToClientMessage = {
      type: 'CAMERA_CONFIG_UPDATE',
      payload: { cameraOverrideActive: false, schedules: [schedule] },
    }
    expect(msg.type).toBe('CAMERA_CONFIG_UPDATE')
  })

  it('identifies SOS_TRIGGERED envelope', () => {
    const msg: ServerToClientMessage = {
      type: 'SOS_TRIGGERED',
      payload: { patientId: 'p-1', timestamp: new Date().toISOString() },
    }
    expect(msg.type).toBe('SOS_TRIGGERED')
  })

  it('identifies NEW_REPLY envelope', () => {
    const msg: ServerToClientMessage = {
      type: 'NEW_REPLY',
      payload: { messageId: 'm-1', reply: 'yes', repliedAt: new Date().toISOString() },
    }
    expect(msg.type).toBe('NEW_REPLY')
  })

  it('EmitRequest carries targetPatientId and event', () => {
    const req: EmitRequest = {
      targetPatientId: 'patient-uuid',
      event: { type: 'MESSAGE_READ', payload: { id: 'x' } },
    }
    expect(req.targetPatientId).toBe('patient-uuid')
    expect(req.event.type).toBe('MESSAGE_READ')
  })

  it('EmitRequest carries targetFamilyMemberId and event', () => {
    const req: EmitRequest = {
      targetFamilyMemberId: 'family-uuid',
      event: { type: 'NEW_REPLY', payload: { messageId: 'm-1', reply: 'no', repliedAt: new Date().toISOString() } },
    }
    expect(req.targetFamilyMemberId).toBe('family-uuid')
  })

  it('identifies PATIENT_STATUS_CHANGE envelope', () => {
    const online: ServerToClientMessage = {
      type: 'PATIENT_STATUS_CHANGE',
      payload: { patientId: 'p-1', status: 'online' },
    }
    const offline: ServerToClientMessage = {
      type: 'PATIENT_STATUS_CHANGE',
      payload: { patientId: 'p-1', status: 'offline' },
    }
    expect(online.type).toBe('PATIENT_STATUS_CHANGE')
    expect(offline.payload.status).toBe('offline')
  })

  it('caregiver REGISTER carries the patientIds room list', () => {
    const reg: ClientToServerMessage = {
      type: 'REGISTER',
      role: 'caregiver',
      familyMemberId: 'family-uuid',
      patientIds: ['p-1', 'p-2'],
    }
    expect(reg.role).toBe('caregiver')
    if (reg.role === 'caregiver') {
      expect(reg.patientIds).toEqual(['p-1', 'p-2'])
    }
  })

  it('EmitRequest carries targetPatientAlerts and event', () => {
    const req: EmitRequest = {
      targetPatientAlerts: 'patient-uuid',
      event: { type: 'SOS_TRIGGERED', payload: { patientId: 'patient-uuid', timestamp: new Date().toISOString() } },
    }
    expect(req.targetPatientAlerts).toBe('patient-uuid')
  })
})
