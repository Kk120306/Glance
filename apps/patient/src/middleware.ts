import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'x-device-token'
const COOKIE_MAX_AGE = 315360000 // 10 years
/** Browser-facing URL for client fetches lives in DASHBOARD_URL on the page component. */
const DASHBOARD_INTERNAL_URL =
  process.env.DASHBOARD_INTERNAL_URL ?? process.env.DASHBOARD_URL ?? 'http://localhost:3001'

/**
 * Is this setup token allowed to pair the device?
 *
 * Patients registered through the dashboard get a random per-patient
 * `device_token` stored in the DB, so the token in a setup link is not a single
 * static value. We validate it against the source of truth (the dashboard API),
 * keeping `PATIENT_DEVICE_TOKEN` as an offline fast-path for single-device
 * deployments and local dev.
 */
async function isValidSetupToken(token: string): Promise<boolean> {
  if (process.env.PATIENT_DEVICE_TOKEN && token === process.env.PATIENT_DEVICE_TOKEN) {
    return true
  }
  try {
    const res = await fetch(`${DASHBOARD_INTERNAL_URL}/api/patient/me`, {
      headers: { 'x-device-token': token },
    })
    return res.ok
  } catch {
    // Dashboard unreachable — reject the link rather than pair an unverified token.
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { searchParams } = req.nextUrl

  // Only guard the root path — static assets etc. are excluded by matcher
  const tokenParam = searchParams.get('token')

  if (tokenParam !== null) {
    // Bootstrapping path: validate the token, then pin it into a cookie so the
    // app authenticates every later request with the token the device was set
    // up with (not a single env value).
    if (!tokenParam || !(await isValidSetupToken(tokenParam))) {
      return new NextResponse('Invalid setup token', { status: 403 })
    }
    const response = NextResponse.redirect(new URL('/', req.url))
    response.cookies.set(COOKIE_NAME, tokenParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
    return response
  }

  // All other requests: require a paired device-token cookie. Real per-call
  // auth is enforced by the dashboard API; keeping this gate presence-based
  // means a paired device still loads its shell — and SOS stays available —
  // even if the dashboard is briefly unreachable.
  const cookie = req.cookies.get(COOKIE_NAME)
  if (!cookie?.value) {
    return new NextResponse('Device not set up — contact your administrator', {
      status: 403,
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
