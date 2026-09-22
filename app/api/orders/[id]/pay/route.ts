import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { method, amountCents } = await request.json();

  const payment = await prisma.payment.create({ data: { orderId: id, method, amountCents } });
  const order = await prisma.order.update({ where: { id }, data: { status: 'paid' }, include: { items: true, payments: true } });

  return NextResponse.json({ order, payment });
}
