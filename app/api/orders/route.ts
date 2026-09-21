import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  const { restaurantId, staffId, deviceId, locationType, locationLabel } = await request.json();
  const order = await prisma.order.create({
    data: {
      restaurantId,
      createdByStaffId: staffId,
      deviceId,
      locationType,
      locationLabel,
      status: 'open',
    },
  });
  return NextResponse.json({ order }, { status: 201 });
}
