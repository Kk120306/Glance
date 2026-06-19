import type { CameraSchedule } from '../ws/types'

export const GAZE_DWELL_MS = 1500
export const SCAN_CYCLE_MS = 1500
export const EAR_THRESHOLD = 0.20
export const SOS_THRESHOLD = 0.15

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export function isCameraWindowActive(
  schedules: CameraSchedule[],
  overrideActive: boolean,
  now: Date = new Date(),
): boolean {
  if (overrideActive) return true
  if (schedules.length === 0) return false

  for (const schedule of schedules) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: schedule.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.formatToParts(now)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''

    const dayOfWeek = DAY_MAP[get('weekday')] ?? -1
    if (dayOfWeek !== schedule.dayOfWeek) continue

    // Some implementations emit "24" for midnight; normalize to "00"
    let hour = get('hour')
    if (hour === '24') hour = '00'
    const currentTime = `${hour}:${get('minute')}`

    if (currentTime >= schedule.startTime && currentTime < schedule.endTime) {
      return true
    }
  }

  return false
}
