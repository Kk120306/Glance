import { describe, it, expect } from 'vitest'
import type { ServerToClientMessage, EmitRequest } from '../ws/types'

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
        recipientId: 'patient-uuid',
        content: 'Hello',
        isYesNo: false,
        isRead: false,
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

  it('EmitRequest carries room and event', () => {
    const req: EmitRequest = {
      room: 'patient-uuid',
      event: { type: 'MESSAGE_READ', payload: { id: 'x' } },
    }
    expect(req.room).toBe('patient-uuid')
    expect(req.event.type).toBe('MESSAGE_READ')
  })
})
