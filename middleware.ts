import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '@/lib/adminSession';

/**
 * Gates every /api/admin/* route except login/session behind the admin
 * session cookie. The /admin page route itself is left ungated — it
 * renders only a password form or dashboard chrome client-side and holds
 * no data until an authenticated call to one of these routes succeeds.
 */
const UNPROTECTED_PATHS = new Set(['/api/admin/login', '/api/admin/session']);

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (UNPROTECTED_PATHS.has(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await verifySessionToken(token);

  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
