import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openOfflineDb } from '../../lib/offline/db';
import { enqueueMutation, listPendingMutations, clearMutation } from '../../lib/offline/queue';

describe('offline mutation queue', () => {
  it('enqueues, lists, and clears mutations in order', async () => {
    const db = await openOfflineDb();
    await enqueueMutation(db, { id: 'm1', entity: 'order', entityId: 'o1', op: 'create', payload: {}, updatedAt: '2026-01-01T00:00:00Z' });
    await enqueueMutation(db, { id: 'm2', entity: 'orderItem', entityId: 'oi1', op: 'create', payload: {}, updatedAt: '2026-01-01T00:00:01Z' });

    const pending = await listPendingMutations(db);
    expect(pending.map((m) => m.id)).toEqual(['m1', 'm2']);

    await clearMutation(db, 'm1');
    expect((await listPendingMutations(db)).map((m) => m.id)).toEqual(['m2']);
  });
});
