import { colors, typography, spacing, radius } from './tokens'
import type { Config } from 'tailwindcss'

export const glancePreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand:   colors.brand,
        neutral: colors.neutral,
        patient: colors.patient,
        success: colors.success,
        error:   colors.error,
        warning: colors.warning,
      },
      fontFamily: typography.fontFamily,
      fontSize:   typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      spacing:    spacing,
      borderRadius: radius,
    },
  },
}
