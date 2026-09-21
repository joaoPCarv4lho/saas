import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { POST } from '../../app/api/orders/[id]/pay/route';

describe('payments API', () => {
  afterAll(() => prisma.$disconnect());

  it('records a payment and marks order paid', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, createdByStaffId: staff.id, deviceId: 'd1', locationType: 'counter', locationLabel: 'balcao', status: 'delivered' },
    });

    const res = await POST(new Request(`http://x/api/orders/${order.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method: 'pix', amountCents: 1500 }),
    }), { params: Promise.resolve({ id: order.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.status).toBe('paid');
    expect(body.payment.method).toBe('pix');
  });
});
