import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseSessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const url = new URL(request.url);
  let restaurantId = url.searchParams.get('restaurantId');
  if (!restaurantId) {
    const session = parseSessionCookie((await cookies()).get('session')?.value);
    restaurantId = session?.restaurantId ?? null;
  }
  if (!restaurantId) return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: 'asc' },
    include: { items: true },
  });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const { restaurantId, categoryName, itemName, priceCents } = await request.json();

  let category = await prisma.menuCategory.findFirst({ where: { restaurantId, name: categoryName } });
  if (!category) {
    category = await prisma.menuCategory.create({ data: { restaurantId, name: categoryName, sortOrder: 0 } });
  }

  const item = await prisma.menuItem.create({
    data: { categoryId: category.id, name: itemName, priceCents, available: true },
  });

  return NextResponse.json({ item }, { status: 201 });
}
