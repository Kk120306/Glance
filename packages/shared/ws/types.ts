import type { Message } from '../db/schema'

export type ServerToClientMessage =
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'MESSAGE_READ'; payload: { id: string } }

export type EmitRequest = {
  room: string
  event: ServerToClientMessage
}
