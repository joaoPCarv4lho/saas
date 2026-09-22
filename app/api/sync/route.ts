import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface Mutation {
  id: string;
  entity: 'order' | 'orderItem' | 'payment';
  entityId: string;
  op: 'create' | 'update';
  payload: Record<string, unknown>;
  updatedAt: string;
}

export async function POST(request: Request) {
  const { mutations } = (await request.json()) as { mutations: Mutation[] };
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const mutation of mutations) {
    if (mutation.entity === 'order' && mutation.op === 'update') {
      const current = await prisma.order.findUnique({ where: { id: mutation.entityId } });
      if (!current || new Date(mutation.updatedAt) <= current.updatedAt) {
        rejected.push(mutation.id);
        continue;
      }
      await prisma.order.update({ where: { id: mutation.entityId }, data: mutation.payload });
      applied.push(mutation.id);
    } else if (mutation.entity === 'orderItem' && mutation.op === 'create') {
      await prisma.orderItem.create({ data: mutation.payload as never });
      applied.push(mutation.id);
    } else {
      rejected.push(mutation.id);
    }
  }

  return NextResponse.json({ applied, rejected });
}
