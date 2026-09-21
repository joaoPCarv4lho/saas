import { createHash } from 'crypto';
import { prisma } from './db';

export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

export function sessionCookieValue(session: { staffId: string; restaurantId: string }): string {
  return Buffer.from(JSON.stringify(session)).toString('base64url');
}

export function parseSessionCookie(value: string | undefined): { staffId: string; restaurantId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed?.staffId === 'string' && typeof parsed?.restaurantId === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function verifyLogin(restaurantId: string, pin: string, staffId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || restaurant.pinHash !== hashPin(pin)) return null;
  const staff = await prisma.staff.findFirst({ where: { id: staffId, restaurantId } });
  if (!staff) return null;
  return { staffId: staff.id, restaurantId };
}
