import { describe, it, expect } from 'vitest'
import { messageSchema } from '../db/validation'

describe('messageSchema', () => {
  it('accepts valid content', () => {
    const result = messageSchema.safeParse({ content: 'Hello!' })
    expect(result.success).toBe(true)
  })

  it('rejects empty content', () => {
    const result = messageSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/empty/i)
    }
  })

  it('rejects content longer than 1000 chars', () => {
    const result = messageSchema.safeParse({ content: 'a'.repeat(1001) })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/too long/i)
    }
  })

  it('accepts exactly 1000 chars', () => {
    const result = messageSchema.safeParse({ content: 'a'.repeat(1000) })
    expect(result.success).toBe(true)
  })

  it('defaults isYesNo to false', () => {
    const result = messageSchema.safeParse({ content: 'Hi' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isYesNo).toBe(false)
    }
  })

  it('accepts isYesNo: true', () => {
    const result = messageSchema.safeParse({ content: 'Yes or no?', isYesNo: true })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isYesNo).toBe(true)
    }
  })
})
