import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPin } from '@/lib/auth';

export async function GET() {
  const restaurant = await prisma.restaurant.create({ data: { name: 'E2E', pinHash: hashPin('1234') } });
  const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'E2E Staff' } });
  const category = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'E2E Cat', sortOrder: 0 } });
  const item = await prisma.menuItem.create({ data: { categoryId: category.id, name: 'ItemE2E', priceCents: 100, available: true } });
  return NextResponse.json({ restaurantId: restaurant.id, staffId: staff.id, menuItemName: item.name });
}
