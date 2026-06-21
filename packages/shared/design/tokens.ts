// ── Glance design tokens ─────────────────────────────────────────────────────
// The single source of truth for the Glance visual language: a warm cream canvas,
// violet-led brand with teal/pink accents, and the Source Serif 4 × Atkinson
// Hyperlegible type pairing. Both apps consume these through the Tailwind preset
// (see tailwind-preset.ts) and directly in inline styles.

export const colors = {
  // Foundation — warm cream canvas, white surfaces, ink text.
  canvas:      '#F4EEE6',
  surface:     '#FFFFFF',
  surfaceWarm: '#FBF6F0',
  ink:         '#241E2B',
  inkMuted:    '#6B6470',
  inkFaint:    '#9A93A0',
  inkBody:     '#5A5260',
  border:      '#ECE5DB',
  borderWarm:  '#E4DAD0',
  track:       '#EFE7DC',

  brand: {
    primary:   '#7C5CFC', // violet · primary
    soft:      '#EFE9FF', // violet soft (tinted surfaces / chips)
    deep:      '#5B3FD6', // violet text on soft violet
    secondary: '#EC6FB8', // pink · warmth
  },

  // Generic neutral ramp — kept for dashboard utility surfaces.
  neutral: {
    0:   '#FFFFFF',
    50:  '#FBF6F0',
    100: '#F4EEE6',
    200: '#ECE5DB',
    300: '#E4DAD0',
    400: '#9A93A0',
    500: '#6B6470',
    700: '#3A3442',
    900: '#241E2B',
  },

  // Patient-facing semantic palette (Glance warm system).
  patient: {
    bg:         '#F4EEE6', // canvas
    surface:    '#FFFFFF',
    surfaceWarm:'#FBF6F0',
    text:       '#241E2B',
    textMuted:  '#6B6470',
    accent:     '#7C5CFC', // violet · primary
    accentSoft: '#EFE9FF',
    warm:       '#EC6FB8', // pink · warmth
    affirm:     '#0E9384', // teal · affirm
    affirmSoft: '#D9F6F0',
    affirmInk:  '#0B6F63',
    sos:        '#E5484D', // SOS · urgent
    sosFg:      '#FFFFFF',
    sosSoft:    '#FDECEC',
    sosInk:     '#C62A2F',
    highlight:  '#F59E0B', // help · caution
    highlightInk:'#B5760A',
  },

  // Blob Agent gradient stops + facial ink, keyed by emotional state.
  blob: {
    warm:      { from: '#D6C6FF', mid: '#A98CF7', to: '#EC8FDE', eye: '#3A2566' },
    neutral:   { from: '#D9CCFF', mid: '#A99BE8', to: '#9D8FD8', eye: '#3A3160' },
    listening: { from: '#BFE9E2', mid: '#5FC9BD', to: '#A98CF7', eye: '#0C3F3A' },
    speaking:  { from: '#FBD9F1', mid: '#EC8FDE', to: '#A98CF7', eye: '#4A2560' },
    urgent:    { from: '#FFC7B0', mid: '#FB7185', to: '#E5484D', eye: '#6B1418' },
  },

  success: '#1F9D63',
  error:   '#E5484D',
  warning: '#F59E0B',
} as const

export const typography = {
  fontFamily: {
    sans:    '"Atkinson Hyperlegible", system-ui, sans-serif',
    serif:   '"Source Serif 4", Georgia, serif',
    mono:    '"JetBrains Mono", monospace',
    // Display copy and spoken messages use the serif.
    display: '"Source Serif 4", Georgia, serif',
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
  sm:   '0.5rem',
  md:   '0.875rem',
  lg:   '1.375rem',
  xl:   '1.75rem',
  full: '9999px',
} as const

export const shadow = {
  sm: '0 1px 3px rgba(36,30,43,0.06)',
  md: '0 8px 24px rgba(36,30,43,0.08)',
  lg: '0 18px 40px rgba(36,30,43,0.12)',
} as const
