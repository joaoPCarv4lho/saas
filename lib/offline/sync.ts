import type { IDBPDatabase } from 'idb';
import { listPendingMutations, clearMutation } from './queue';

export async function syncNow(db: IDBPDatabase, fetchImpl: typeof fetch = fetch) {
  const mutations = await listPendingMutations(db);
  if (mutations.length === 0) return { applied: [], rejected: [] };

  const response = await fetchImpl('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  });
  const result = (await response.json()) as { applied: string[]; rejected: string[] };

  for (const id of [...result.applied, ...result.rejected]) {
    await clearMutation(db, id);
  }

  return result;
}

export function startAutoSync(db: IDBPDatabase, intervalMs = 15000): () => void {
  const tick = () => void syncNow(db);
  const interval = setInterval(tick, intervalMs);
  window.addEventListener('online', tick);
  return () => {
    clearInterval(interval);
    window.removeEventListener('online', tick);
  };
}
