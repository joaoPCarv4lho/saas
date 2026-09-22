import { NextResponse } from 'next/server';
import { verifyLogin, sessionCookieValue } from '@/lib/auth';

export async function POST(request: Request) {
  const { restaurantId, staffId, pin } = await request.json();
  const session = await verifyLogin(restaurantId, pin, staffId);
  if (!session) return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  const response = NextResponse.json({ ok: true, session });
  response.cookies.set('session', sessionCookieValue(session), { httpOnly: true, sameSite: 'lax', path: '/' });
  return response;
}
