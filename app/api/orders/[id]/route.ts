import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  if (body.addItem) {
    await prisma.orderItem.create({
      data: {
        orderId: id,
        menuItemId: body.addItem.menuItemId,
        quantity: body.addItem.quantity,
        note: body.addItem.note ?? '',
        status: 'pending',
      },
    });
  }

  if (body.status) {
    await prisma.order.update({ where: { id }, data: { status: body.status } });
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payments: true } });
  return NextResponse.json({ order });
}
