import type { IDBPDatabase } from 'idb';
import type { Mutation } from './db';

export async function enqueueMutation(db: IDBPDatabase, mutation: Mutation): Promise<void> {
  await db.put('mutationQueue', mutation);
}

export async function listPendingMutations(db: IDBPDatabase): Promise<Mutation[]> {
  const all = await db.getAll('mutationQueue');
  return all.sort((a: Mutation, b: Mutation) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function clearMutation(db: IDBPDatabase, mutationId: string): Promise<void> {
  await db.delete('mutationQueue', mutationId);
}
