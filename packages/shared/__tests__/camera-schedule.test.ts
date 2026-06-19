import { describe, it, expect } from 'vitest'
import { isCameraWindowActive } from '../utils/cameraSchedule'
import type { CameraSchedule } from '../ws/types'

const mondayNYSchedule: CameraSchedule = {
  dayOfWeek: 1, // Monday
  startTime: '09:00',
  endTime: '17:00',
  timezone: 'America/New_York',
}

describe('isCameraWindowActive', () => {
  it('returns true for override even with empty schedules', () => {
    expect(isCameraWindowActive([], true)).toBe(true)
  })

  it('returns false with no schedules and no override', () => {
    expect(isCameraWindowActive([], false)).toBe(false)
  })

  it('returns true during schedule window', () => {
    // Monday Jan 8 2024 12:00 EST = 17:00 UTC (EST = UTC-5)
    const now = new Date('2024-01-08T17:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(true)
  })

  it('returns false before schedule window starts', () => {
    // Monday Jan 8 2024 07:00 EST = 12:00 UTC
    const now = new Date('2024-01-08T12:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(false)
  })

  it('returns false after schedule window ends', () => {
    // Monday Jan 8 2024 18:00 EST = 23:00 UTC
    const now = new Date('2024-01-08T23:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(false)
  })

  it('returns false on the wrong day', () => {
    // Tuesday Jan 9 2024 12:00 EST = 17:00 UTC
    const now = new Date('2024-01-09T17:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(false)
  })

  it('returns true at exact start time (inclusive)', () => {
    // Monday Jan 8 2024 09:00 EST = 14:00 UTC
    const now = new Date('2024-01-08T14:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(true)
  })

  it('returns false at exact end time (exclusive)', () => {
    // Monday Jan 8 2024 17:00 EST = 22:00 UTC
    const now = new Date('2024-01-08T22:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(false)
  })

  it('handles DST spring-forward correctly (EDT, UTC-4)', () => {
    // March 10 2024: clocks spring forward at 2am
    // Monday Mar 11 2024 10:00 EDT (UTC-4) = 14:00 UTC
    const now = new Date('2024-03-11T14:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(true)
  })

  it('handles DST fall-back correctly (EST, UTC-5)', () => {
    // Monday Nov 4 2024 10:00 EST (UTC-5) = 15:00 UTC (after fall-back)
    const now = new Date('2024-11-04T15:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], false, now)).toBe(true)
  })

  it('override true takes precedence over empty schedule', () => {
    expect(isCameraWindowActive([], true, new Date())).toBe(true)
  })

  it('override true takes precedence even outside schedule window', () => {
    // Sunday, not in schedule
    const now = new Date('2024-01-07T15:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule], true, now)).toBe(true)
  })

  it('matches first matching schedule among multiple', () => {
    const tuesdaySchedule: CameraSchedule = {
      dayOfWeek: 2,
      startTime: '10:00',
      endTime: '15:00',
      timezone: 'UTC',
    }
    // Tuesday 12:00 UTC
    const now = new Date('2024-01-09T12:00:00Z')
    expect(isCameraWindowActive([mondayNYSchedule, tuesdaySchedule], false, now)).toBe(true)
  })
})
