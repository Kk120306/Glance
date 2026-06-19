import { NextRequest, NextResponse } from 'next/server'

const publicPaths = ['/login', '/api/auth']
const SESSION_COOKIE = 'better-auth.session_token'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Lightweight cookie-presence check — actual session validation happens in API routes
  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
