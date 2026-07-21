import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from './lib/supabase/middleware.js';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/auth'];

/**
 * Root middleware: refreshes the Supabase session on every request and redirects
 * unauthenticated users to /login (except public paths + static assets).
 */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)'],
};
