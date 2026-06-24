/** Session flag: caregiver chose to skip voice onboarding for this browser session. */
export const VOICE_ONBOARDING_SKIP_KEY = 'glance_voice_onboarding_skipped'

export function hasSkippedVoiceOnboarding(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(VOICE_ONBOARDING_SKIP_KEY) === '1'
}

export function skipVoiceOnboarding(): void {
  sessionStorage.setItem(VOICE_ONBOARDING_SKIP_KEY, '1')
}

export function clearVoiceOnboardingSkip(): void {
  sessionStorage.removeItem(VOICE_ONBOARDING_SKIP_KEY)
}
