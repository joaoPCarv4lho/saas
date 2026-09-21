import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { POST as createOrder } from '../../app/api/orders/route';
import { PATCH, GET } from '../../app/api/orders/[id]/route';

describe('orders API', () => {
  afterAll(() => prisma.$disconnect());

  it('creates an order and adds an item', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const category = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'C', sortOrder: 0 } });
    const menuItem = await prisma.menuItem.create({ data: { categoryId: category.id, name: 'Item', priceCents: 100, available: true } });

    const createRes = await createOrder(new Request('http://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: restaurant.id, staffId: staff.id, deviceId: 'd1', locationType: 'table', locationLabel: '5' }),
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
  });
});
