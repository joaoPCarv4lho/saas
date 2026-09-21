import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
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
});
