import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'x-device-token'
const COOKIE_MAX_AGE = 315360000 // 10 years

export function middleware(req: NextRequest) {
  const deviceToken = process.env.PATIENT_DEVICE_TOKEN
  const { pathname, searchParams } = req.nextUrl

  // Only guard the root path — static assets etc. are excluded by matcher
  const tokenParam = searchParams.get('token')

  if (tokenParam !== null) {
    // Bootstrapping path: validate and set cookie
    if (!deviceToken || tokenParam !== deviceToken) {
      return new NextResponse('Invalid setup token', { status: 403 })
    }
    const response = NextResponse.redirect(new URL('/', req.url))
    response.cookies.set(COOKIE_NAME, deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
    return response
  }

  // All other requests: require valid cookie
  const cookie = req.cookies.get(COOKIE_NAME)
  if (!deviceToken || !cookie || cookie.value !== deviceToken) {
    return new NextResponse('Device not set up — contact your administrator', {
      status: 403,
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
