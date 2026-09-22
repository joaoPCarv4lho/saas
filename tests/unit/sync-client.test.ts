import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { openOfflineDb } from '../../lib/offline/db';
import { enqueueMutation } from '../../lib/offline/queue';
import { syncNow } from '../../lib/offline/sync';

describe('syncNow', () => {
  it('pushes pending mutations and clears the ones the server applied', async () => {
    const db = await openOfflineDb();
    await enqueueMutation(db, { id: 'm1', entity: 'order', entityId: 'o1', op: 'update', payload: { status: 'preparing' }, updatedAt: '2026-01-01T00:00:00Z' });

    const fetchImpl = vi.fn().mockResolvedValue({
      json: async () => ({ applied: ['m1'], rejected: [] }),
    });

    const result = await syncNow(db, fetchImpl as unknown as typeof fetch);

    expect(result.applied).toEqual(['m1']);
    expect(fetchImpl).toHaveBeenCalledWith('/api/sync', expect.objectContaining({ method: 'POST' }));
    const remaining = await db.getAll('mutationQueue');
    expect(remaining).toHaveLength(0);
  });
});
