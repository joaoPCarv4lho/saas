import { prisma } from '../lib/db';
import { createHash } from 'crypto';

async function main() {
  const pinHash = createHash('sha256').update('1234').digest('hex');
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Restaurante Teste', pinHash },
  });
  const staff = await prisma.staff.create({
    data: { restaurantId: restaurant.id, name: 'Garcom Teste', isAdmin: true },
  });
  const category = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: 'Bebidas', sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: category.id, name: 'Refrigerante', priceCents: 800, available: true },
  });
  console.log({ restaurantId: restaurant.id, staffId: staff.id });
}

main().finally(() => prisma.$disconnect());
