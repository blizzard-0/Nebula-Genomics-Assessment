import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SavedMeta, SavedPayload } from '@/lib/savedDatasets';
import {
  getMeta,
  getPayload,
  hashFiles,
  isStorageAvailable,
  listSaved,
  removeSaved,
  saveDataset,
  updateMeta,
} from '@/lib/savedDatasets';
import { makeDataset, makeOrder } from './fixtures';

function record(id: string, savedAt: number): { meta: SavedMeta; payload: SavedPayload } {
  return {
    meta: {
      id,
      name: `Dataset ${id}`,
      named: false,
      savedAt,
      asOf: null,
      files: [{ name: 'orders.csv', size: 10 }],
      summary: { asOf: 1, orders: 1, kits: 0, stuck: 0 },
      engineVersion: '2',
    },
    payload: {
      id,
      files: [{ name: 'orders.csv', text: 'order_id\no1' }],
      dataset: makeDataset([makeOrder('o1')], []),
    },
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('saved datasets in IndexedDB', () => {
  it('saves, lists newest first, reads and removes', async () => {
    expect(await isStorageAvailable()).toBe(true);
    const a = record('a', 1);
    const b = record('b', 2);
    await saveDataset(a.meta, a.payload);
    await saveDataset(b.meta, b.payload);

    expect((await listSaved()).map((m) => m.id)).toEqual(['b', 'a']);
    const payload = await getPayload('a');
    expect(payload?.files[0]?.text).toBe('order_id\no1');
    expect(payload?.dataset.orders[0]?.id).toBe('o1');

    await updateMeta({ ...a.meta, name: 'Renamed', named: true });
    expect((await getMeta('a'))?.name).toBe('Renamed');

    await removeSaved('a');
    expect((await listSaved()).map((m) => m.id)).toEqual(['b']);
    expect(await getPayload('a')).toBeUndefined();
  });

  it('reports storage as unavailable when IndexedDB is missing', async () => {
    // @ts-expect-error simulate a browser without IndexedDB
    globalThis.indexedDB = undefined;
    expect(await isStorageAvailable()).toBe(false);
    await expect(listSaved()).rejects.toThrow('not available');
  });
});

describe('hashFiles', () => {
  it('ignores file order but not content', async () => {
    const one = await hashFiles(['orders', 'events']);
    expect(await hashFiles(['events', 'orders'])).toBe(one);
    expect(await hashFiles(['orders', 'events!'])).not.toBe(one);
    expect(one).toMatch(/^[0-9a-f]{24}$/);
  });
});
