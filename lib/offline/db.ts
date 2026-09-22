import { openDB, type IDBPDatabase } from 'idb';

export interface Mutation {
  id: string;
  entity: 'order' | 'orderItem' | 'payment';
  entityId: string;
  op: 'create' | 'update';
  payload: Record<string, unknown>;
  updatedAt: string;
}

const DB_NAME = 'restaurant-offline';
const DB_VERSION = 1;

export function openOfflineDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('mutationQueue', { keyPath: 'id' });
      db.createObjectStore('orders', { keyPath: 'id' });
      db.createObjectStore('menu', { keyPath: 'id' });
    },
  });
}
