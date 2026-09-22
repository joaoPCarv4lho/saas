import { describe, it, expect } from 'vitest';
import { hashPin, sessionCookieValue, parseSessionCookie } from '../../lib/auth';

describe('auth', () => {
  it('hashPin is deterministic', () => {
    expect(hashPin('1234')).toBe(hashPin('1234'));
    expect(hashPin('1234')).not.toBe(hashPin('4321'));
  });

  it('round-trips a session cookie', () => {
    const cookie = sessionCookieValue({ staffId: 's1', restaurantId: 'r1' });
    expect(parseSessionCookie(cookie)).toEqual({ staffId: 's1', restaurantId: 'r1' });
  });

  it('rejects a malformed cookie', () => {
    expect(parseSessionCookie('garbage')).toBeNull();
    expect(parseSessionCookie(undefined)).toBeNull();
  });
});
