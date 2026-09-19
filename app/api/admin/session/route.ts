import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifySessionToken } from '@/lib/adminSession';

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const authenticated = await verifySessionToken(token);
  return NextResponse.json({ authenticated });
}
