import { glancePreset } from '@glance/shared/design/tailwind-preset'
import type { Config } from 'tailwindcss'

export default {
  presets: [glancePreset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/shared/design/components/**/*.{ts,tsx}',
  ],
} satisfies Config
