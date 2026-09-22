import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/db';

describe('prisma schema', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a restaurant with nested staff and menu', async () => {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: 'Test',
        pinHash: 'x',
        staff: { create: { name: 'Alice' } },
      },
      include: { staff: true },
    });
    expect(restaurant.staff[0].name).toBe('Alice');
  });
});
