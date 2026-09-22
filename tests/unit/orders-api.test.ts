import { describe, it, expect, afterAll, vi } from 'vitest';
import { prisma } from '../../lib/db';
import { sessionCookieValue } from '../../lib/auth';

// POST/GET /api/orders now read staffId/restaurantId from the session cookie via
// next/headers `cookies()`, which only works inside a real Next.js request scope.
// Mock it so the route handlers can be unit-tested directly.
const state = vi.hoisted(() => ({ session: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'session' && state.session ? { value: state.session } : undefined),
  }),
}));

import { POST as createOrder, GET as listOrders } from '../../app/api/orders/route';
import { PATCH, GET } from '../../app/api/orders/[id]/route';

describe('orders API', () => {
  afterAll(() => prisma.$disconnect());

  it('creates an order and adds an item', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const category = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'C', sortOrder: 0 } });
    const menuItem = await prisma.menuItem.create({ data: { categoryId: category.id, name: 'Item', priceCents: 100, available: true } });

    state.session = sessionCookieValue({ staffId: staff.id, restaurantId: restaurant.id });

    const createRes = await createOrder(new Request('http://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd1', locationType: 'table', locationLabel: '5' }),
    }));
    expect(createRes.status).toBe(201);
    const { order } = await createRes.json();
    expect(order.status).toBe('open');

    const patchRes = await PATCH(new Request(`http://x/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ addItem: { menuItemId: menuItem.id, quantity: 2, note: '' } }),
    }), { params: Promise.resolve({ id: order.id }) });
    expect(patchRes.status).toBe(200);

    const getRes = await GET(new Request(`http://x/api/orders/${order.id}`), { params: Promise.resolve({ id: order.id }) });
    const body = await getRes.json();
    expect(body.order.items).toHaveLength(1);
    expect(body.order.items[0].quantity).toBe(2);

    const listRes = await listOrders();
    const listBody = await listRes.json();
    expect(listBody.orders.map((o: { id: string }) => o.id)).toContain(order.id);
  });

  it('rejects POST and GET without a session cookie', async () => {
    state.session = undefined;
    const res = await createOrder(new Request('http://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'd1', locationType: 'table', locationLabel: '5' }),
    }));
    expect(res.status).toBe(401);

    const listRes = await listOrders();
    expect(listRes.status).toBe(401);
  });
});
