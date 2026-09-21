import { describe, it, expect, afterAll, vi } from 'vitest';
import { prisma } from '../../lib/db';
import { sessionCookieValue } from '../../lib/auth';

// POST /api/menu falls back to staffId/restaurantId from the session cookie via
// next/headers `cookies()`, which only works inside a real Next.js request scope.
// Mock it so the route handlers can be unit-tested directly.
const state = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'session' && state.session ? { value: state.session } : undefined),
  }),
}));

import { GET, POST } from '../../app/api/menu/route';

describe('menu API', () => {
  afterAll(() => prisma.$disconnect());

  it('creates and lists a menu item', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });

    const postRes = await POST(new Request('http://x/api/menu', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: restaurant.id, categoryName: 'Bebidas', itemName: 'Suco', priceCents: 500 }),
    }));
    expect(postRes.status).toBe(201);

    const getRes = await GET(new Request(`http://x/api/menu?restaurantId=${restaurant.id}`));
    const body = await getRes.json();
    expect(body.categories[0].items[0].name).toBe('Suco');
  });

  it('falls back to the session cookie restaurantId when the body omits it', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R2', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    state.session = sessionCookieValue({ staffId: staff.id, restaurantId: restaurant.id });

    const postRes = await POST(new Request('http://x/api/menu', {
      method: 'POST',
      body: JSON.stringify({ categoryName: 'Pratos', itemName: 'Feijoada', priceCents: 2500 }),
    }));
    expect(postRes.status).toBe(201);

    const getRes = await GET(new Request(`http://x/api/menu?restaurantId=${restaurant.id}`));
    const body = await getRes.json();
    expect(body.categories[0].items[0].name).toBe('Feijoada');

    state.session = undefined;
  });

  it('rejects POST without restaurantId in body or session cookie', async () => {
    state.session = undefined;
    const res = await POST(new Request('http://x/api/menu', {
      method: 'POST',
      body: JSON.stringify({ categoryName: 'X', itemName: 'Y', priceCents: 100 }),
    }));
    expect(res.status).toBe(401);
  });
});
