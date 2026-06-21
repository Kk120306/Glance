import { describe, it, expect } from 'vitest'
import { colors, typography, spacing, radius, shadow } from '../design/tokens'
import { glancePreset } from '../design/tailwind-preset'

describe('design tokens', () => {
  it('exports patient.sos as the urgent red', () => {
    expect(colors.patient.sos).toBe('#E5484D')
  })

  it('exports patient.bg as the warm cream canvas', () => {
    expect(colors.patient.bg).toBe('#F4EEE6')
  })

  it('exports patient.accent as the brand violet', () => {
    expect(colors.patient.accent).toBe('#7C5CFC')
  })

  it('exports brand.primary as violet', () => {
    expect(colors.brand.primary).toBe('#7C5CFC')
  })

  it('exports patient font size at 3rem', () => {
    expect(typography.fontSize.patient).toBe('3rem')
  })

  it('spacing.20 is 5rem (≥80px SOS target)', () => {
    expect(spacing[20]).toBe('5rem')
  })

  it('radius.full is 9999px', () => {
    expect(radius.full).toBe('9999px')
  })

  it('shadow keys exist', () => {
    expect(shadow.sm).toBeDefined()
    expect(shadow.md).toBeDefined()
    expect(shadow.lg).toBeDefined()
  })

  it('glancePreset extends colors into Tailwind theme', () => {
    const extend = glancePreset.theme?.extend as Record<string, unknown>
    expect(extend).toBeDefined()
    expect(extend['colors']).toBeDefined()
    const tokenColors = extend['colors'] as typeof colors & { brand: unknown; patient: unknown }
    expect(tokenColors.brand).toBeDefined()
    expect(tokenColors.patient).toBeDefined()
  })
})
