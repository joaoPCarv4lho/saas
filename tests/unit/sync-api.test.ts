import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { POST } from '../../app/api/sync/route';

describe('sync API', () => {
  afterAll(() => prisma.$disconnect());

  it('applies a status update when the mutation is newer than server state', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, createdByStaffId: staff.id, deviceId: 'd1', locationType: 'counter', locationLabel: 'balcao', status: 'open' },
    });

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await POST(new Request('http://x/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [{ id: 'm1', entity: 'order', entityId: order.id, op: 'update', payload: { status: 'preparing' }, updatedAt: future }],
      }),
    }));

    const body = await res.json();
    expect(body.applied).toEqual(['m1']);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('preparing');
  });

  it('rejects a mutation older than current server state', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R2', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, createdByStaffId: staff.id, deviceId: 'd1', locationType: 'counter', locationLabel: 'balcao', status: 'ready' },
    });

    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await POST(new Request('http://x/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [{ id: 'm2', entity: 'order', entityId: order.id, op: 'update', payload: { status: 'preparing' }, updatedAt: past }],
      }),
    }));

    const body = await res.json();
    expect(body.rejected).toEqual(['m2']);

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe('ready');
  });
});
