import { colors, typography, spacing, radius } from './tokens'
import type { Config } from 'tailwindcss'

export const glancePreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        // Foundation
        canvas:      colors.canvas,
        surface:     colors.surface,
        'surface-warm': colors.surfaceWarm,
        ink:         colors.ink,
        'ink-muted': colors.inkMuted,
        'ink-faint': colors.inkFaint,
        'ink-body':  colors.inkBody,
        line:        colors.border,
        'line-warm': colors.borderWarm,
        track:       colors.track,
        // Brand + semantic groups
        brand:   colors.brand,
        neutral: colors.neutral,
        patient: colors.patient,
        success: colors.success,
        error:   colors.error,
        warning: colors.warning,
      },
      fontFamily: {
        sans:    ['"Atkinson Hyperlegible"', 'system-ui', 'sans-serif'],
        serif:   ['"Source Serif 4"', 'Georgia', 'serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
      fontSize:   typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      spacing:    spacing,
      borderRadius: radius,
      boxShadow: {
        soft:  '0 1px 3px rgba(36,30,43,0.06)',
        card:  '0 8px 24px rgba(36,30,43,0.08)',
        lift:  '0 18px 40px rgba(36,30,43,0.12)',
        violet:'0 8px 20px rgba(124,92,252,0.28)',
      },
      transitionDuration: {
        DEFAULT: '180ms',
        fast: '120ms',
        slow: '300ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease',
      },
    },
  },
}
