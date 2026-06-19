export const colors = {
  brand: {
    primary:   '#1A56DB',
    secondary: '#7E3AF2',
  },
  neutral: {
    0:   '#FFFFFF',
    50:  '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    700: '#374151',
    900: '#111827',
  },
  patient: {
    bg:        '#0A0A0A',
    text:      '#F5F5F5',
    accent:    '#22C55E',
    sos:       '#EF4444',
    sosFg:     '#FFFFFF',
    highlight: '#FACC15',
  },
  success: '#16A34A',
  error:   '#DC2626',
  warning: '#D97706',
} as const

export const typography = {
  fontFamily: {
    sans:    '"Inter", system-ui, sans-serif',
    mono:    '"JetBrains Mono", monospace',
    display: '"Atkinson Hyperlegible", "Inter", sans-serif',
  },
  fontSize: {
    xs:        '0.75rem',
    sm:        '0.875rem',
    base:      '1rem',
    lg:        '1.125rem',
    xl:        '1.25rem',
    '2xl':     '1.5rem',
    '3xl':     '1.875rem',
    '4xl':     '2.25rem',
    patient:   '3rem',
    patientLg: '4.5rem',
  },
  fontWeight: {
    normal:   '400',
    medium:   '500',
    semibold: '600',
    bold:     '700',
  },
  lineHeight: {
    tight:  '1.25',
    normal: '1.5',
    loose:  '1.75',
  },
} as const

export const spacing = {
  1:  '0.25rem',
  2:  '0.5rem',
  3:  '0.75rem',
  4:  '1rem',
  6:  '1.5rem',
  8:  '2rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const

export const radius = {
  sm:   '0.25rem',
  md:   '0.5rem',
  lg:   '1rem',
  full: '9999px',
} as const

export const shadow = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
} as const
