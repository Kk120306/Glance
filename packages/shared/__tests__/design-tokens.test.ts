import { describe, it, expect } from 'vitest'
import { colors, typography, spacing, radius, shadow } from '../design/tokens'
import { glancePreset } from '../design/tailwind-preset'

describe('design tokens', () => {
  it('exports patient.sos as red', () => {
    expect(colors.patient.sos).toBe('#EF4444')
  })

  it('exports patient.bg as near-black', () => {
    expect(colors.patient.bg).toBe('#0A0A0A')
  })

  it('exports brand.primary', () => {
    expect(colors.brand.primary).toBe('#1A56DB')
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
