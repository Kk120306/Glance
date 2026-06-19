import { z } from 'zod'

export const messageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
  isYesNo: z.boolean().optional().default(false),
})

export type MessageInput = z.infer<typeof messageSchema>
