import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parseSessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  const session = parseSessionCookie((await cookies()).get('session')?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const orders = await prisma.order.findMany({
    where: { restaurantId: session.restaurantId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const session = parseSessionCookie((await cookies()).get('session')?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceId, locationType, locationLabel } = await request.json();
  const order = await prisma.order.create({
    data: {
      restaurantId: session.restaurantId,
      createdByStaffId: session.staffId,
      deviceId,
      locationType,
      locationLabel,
      status: 'open',
    },
  });
  return NextResponse.json({ order }, { status: 201 });
}
