import { NextRequest, NextResponse } from 'next/server'

const publicPaths = ['/login', '/api/auth']
const SESSION_COOKIE = 'better-auth.session_token'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const origin = req.headers.get('origin') || '*'

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 })
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Device-Token, Authorization')
    response.headers.set('Access-Control-Max-Age', '86400')
    return response
  }

  // Public paths bypass
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    const response = NextResponse.next()
    response.headers.set('Access-Control-Allow-Origin', origin)
    return response
  }

  // Patient client API paths using device-token header bypass session check
  const hasDeviceToken = req.headers.has('x-device-token')
  if (hasDeviceToken) {
    const response = NextResponse.next()
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Device-Token')
    return response
  }

  // Lightweight cookie-presence check — actual session validation happens in API routes
  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()
  response.headers.set('Access-Control-Allow-Origin', origin)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
