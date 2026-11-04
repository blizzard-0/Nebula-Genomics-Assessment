import type { Dataset } from '@contracts';

/**
 * Uploaded datasets saved in the browser (IndexedDB). Nothing is stored on the server.
 *
 * Two object stores keep listing cheap: `meta` holds a small summary per dataset, `payload`
 * holds the original CSV text (to re-analyze later) and the analyzed dataset (to open instantly).
 */

const DB_NAME = 'kit-lifecycle-dashboard';
const DB_VERSION = 1;
const META = 'meta';
const PAYLOAD = 'payload';

export interface SavedFile {
  name: string;
  text: string;
}

export interface SavedSummary {
  asOf: number;
  orders: number;
  kits: number;
  stuck: number;
}

export interface SavedMeta {
  /** Hash of the file contents, so the same pair is only saved once. */
  id: string;
  name: string;
  /** True once the user renamed it; otherwise the name follows the as-of date. */
  named: boolean;
  savedAt: number;
  /** As-of date chosen by the user (YYYY-MM-DD), or null to take it from the data. */
  asOf: string | null;
  files: { name: string; size: number }[];
  summary: SavedSummary;
  engineVersion: string;
}

export interface SavedPayload {
  id: string;
  files: SavedFile[];
  dataset: Dataset;
}

/** Thrown when the browser refuses to store more data. */
export class StorageFullError extends Error {
  constructor() {
    super('Browser storage is full.');
    this.name = 'StorageFullError';
  }
}

/** Thrown when IndexedDB can't be used at all (blocked, or a private window in some browsers). */
export class StorageUnavailableError extends Error {
  constructor() {
    super('Browser storage is not available.');
    this.name = 'StorageUnavailableError';
  }
}

function factory(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'QuotaExceededError';
}

function openDb(): Promise<IDBDatabase> {
  const idb = factory();
  if (!idb) return Promise.reject(new StorageUnavailableError());
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new StorageUnavailableError());
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PAYLOAD)) db.createObjectStore(PAYLOAD, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageUnavailableError());
    req.onblocked = () => reject(new StorageUnavailableError());
  });
}

/** Opens the database for one operation and always closes it again. */
async function withStores<T>(
  mode: IDBTransactionMode,
  run: (meta: IDBObjectStore, payload: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction([META, PAYLOAD], mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    const result = await run(tx.objectStore(META), tx.objectStore(PAYLOAD));
    await done;
    return result;
  } catch (err) {
    if (isQuotaError(err)) throw new StorageFullError();
    throw err;
  } finally {
    db.close();
  }
}

export async function isStorageAvailable(): Promise<boolean> {
  try {
    const db = await openDb();
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** All saved datasets, newest first. */
export function listSaved(): Promise<SavedMeta[]> {
  return withStores('readonly', async (meta) => {
    const all = await request(meta.getAll() as IDBRequest<SavedMeta[]>);
    return all.sort((a, b) => b.savedAt - a.savedAt);
  });
}

export function getPayload(id: string): Promise<SavedPayload | undefined> {
  return withStores('readonly', (_meta, payload) =>
    request(payload.get(id) as IDBRequest<SavedPayload | undefined>),
  );
}

export function getMeta(id: string): Promise<SavedMeta | undefined> {
  return withStores('readonly', (meta) =>
    request(meta.get(id) as IDBRequest<SavedMeta | undefined>),
  );
}

/** Saves (or replaces) a dataset in one transaction. */
export function saveDataset(meta: SavedMeta, payload: SavedPayload): Promise<void> {
  return withStores('readwrite', async (metaStore, payloadStore) => {
    await request(payloadStore.put(payload));
    await request(metaStore.put(meta));
  });
}

export function updateMeta(meta: SavedMeta): Promise<void> {
  return withStores('readwrite', async (metaStore) => {
    await request(metaStore.put(meta));
  });
}

export function removeSaved(id: string): Promise<void> {
  return withStores('readwrite', async (metaStore, payloadStore) => {
    await request(metaStore.delete(id));
    await request(payloadStore.delete(id));
  });
}

/** Bytes used and available for this site, when the browser reports it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est || est.usage === undefined || est.quota === undefined) return null;
    return { usage: est.usage, quota: est.quota };
  } catch {
    return null;
  }
}

/**
 * A stable id for a pair of files. The order of the files does not matter, and neither do
 * their names: the same two exports always get the same id.
 */
export async function hashFiles(texts: readonly string[]): Promise<string> {
  const parts = await Promise.all(texts.map(digest));
  return (await digest([...parts].sort().join('|'))).slice(0, 24);
}

async function digest(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Insecure contexts (plain http on another host) have no WebCrypto: fall back to FNV-1a.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x811c9dc5);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
  ).repeat(4);
}
