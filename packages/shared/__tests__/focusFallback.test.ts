import { describe, it, expect } from 'vitest'
import {
  isFocusValid,
  resolveDefaultFocusId,
  clampScanIndex,
} from '../design/components/focusFallback'

describe('isFocusValid', () => {
  it('returns true when focus id is in the target set', () => {
    expect(isFocusValid('a', ['a', 'b'])).toBe(true)
  })

  it('returns false for null focus', () => {
    expect(isFocusValid(null, ['a'])).toBe(false)
  })

  it('rejects orphaned focus ids', () => {
    expect(isFocusValid('gone', ['a', 'b'])).toBe(false)
  })
})

describe('resolveDefaultFocusId', () => {
  const ordered = ['home:say', 'home:messages', 'home:yesno']

  it('returns first id when focus is null', () => {
    expect(resolveDefaultFocusId(null, ordered)).toBe('home:say')
  })

  it('keeps valid focus unless forceFirst', () => {
    expect(resolveDefaultFocusId('home:messages', ordered)).toBe('home:messages')
  })

  it('resets to first when forceFirst even if focus is valid', () => {
    expect(resolveDefaultFocusId('home:messages', ordered, { forceFirst: true })).toBe('home:say')
  })

  it('returns first when focus is orphaned', () => {
    expect(resolveDefaultFocusId('stale:id', ordered)).toBe('home:say')
  })

  it('returns null when no targets', () => {
    expect(resolveDefaultFocusId(null, [])).toBeNull()
    expect(resolveDefaultFocusId('a', [])).toBeNull()
  })
})

describe('clampScanIndex', () => {
  it('returns 0 when count is zero', () => {
    expect(clampScanIndex(5, 0)).toBe(0)
  })

  it('clamps high index after list shrink', () => {
    expect(clampScanIndex(7, 3)).toBe(2)
  })

  it('clamps negative index to 0', () => {
    expect(clampScanIndex(-1, 4)).toBe(0)
  })

  it('keeps in-range index', () => {
    expect(clampScanIndex(2, 5)).toBe(2)
  })
})
