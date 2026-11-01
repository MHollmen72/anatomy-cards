// On-device storage (IndexedDB). Progress never leaves the device except via export.
import type { CardProgress, ProgressSnapshot, ReviewLogEntry } from './core/types.js';

const DB_NAME = 'anatomy-cards';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { autoIncrement: true });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open storage'));
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage write aborted'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage read failed'));
  });
}

export async function getAllProgress(): Promise<CardProgress[]> {
  const db = await openDb();
  return request(db.transaction('progress').objectStore('progress').getAll() as IDBRequest<CardProgress[]>);
}

export async function getAllLog(): Promise<ReviewLogEntry[]> {
  const db = await openDb();
  return request(db.transaction('log').objectStore('log').getAll() as IDBRequest<ReviewLogEntry[]>);
}

export async function putProgress(...records: CardProgress[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('progress', 'readwrite');
  const store = tx.objectStore('progress');
  for (const r of records) store.put(r);
  await done(tx);
}

/** Saves a grading atomically: the card's new state, the log entry and the counter. */
export async function saveGrading(record: CardProgress, entry: ReviewLogEntry, counter: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['progress', 'log', 'meta'], 'readwrite');
  tx.objectStore('progress').put(record);
  tx.objectStore('log').add(entry);
  tx.objectStore('meta').put(counter, 'counter');
  await done(tx);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return request(db.transaction('meta').objectStore('meta').get(key) as IDBRequest<T | undefined>);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(value, key);
  await done(tx);
}

/** Replaces all progress with an imported snapshot. */
export async function replaceAll(s: ProgressSnapshot): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['progress', 'log', 'meta'], 'readwrite');
  const progress = tx.objectStore('progress');
  const log = tx.objectStore('log');
  progress.clear();
  log.clear();
  for (const c of s.cards) progress.put(c);
  for (const e of s.log) log.add(e);
  tx.objectStore('meta').put(s.counter, 'counter');
  await done(tx);
}

/** Deletes all study progress (keeps UI preferences such as dismissed hints). */
export async function clearProgress(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['progress', 'log', 'meta'], 'readwrite');
  tx.objectStore('progress').clear();
  tx.objectStore('log').clear();
  tx.objectStore('meta').delete('counter');
  tx.objectStore('meta').delete('lastExport');
  await done(tx);
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
