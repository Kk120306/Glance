import { redirect } from 'next/navigation'

/**
 * The cross-patient Messages inbox was removed — a single feed surfaced every
 * patient's conversation in one place. Per-patient threads live on each patient's
 * page instead. This route now redirects so old links/bookmarks stay harmless.
 */
export default function MessagesPage() {
  redirect('/dashboard')
}
