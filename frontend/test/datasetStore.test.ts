import type { Dataset } from '@contracts';
import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ClientModule from '@/api/client';
import * as api from '@/api/client';
import type * as StorageModule from '@/lib/savedDatasets';
import * as storage from '@/lib/savedDatasets';
import { SAMPLE_ID, useDatasetStore } from '@/stores/dataset';
import { makeDataset, makeOrder, makeStuck } from './fixtures';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return {
    ...actual,
    analyzeFiles: vi.fn(),
    fetchSampleDataset: vi.fn(),
    fetchHealth: vi.fn(),
  };
});

vi.mock('@/lib/savedDatasets', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return { ...actual, saveDataset: vi.fn(actual.saveDataset) };
});

const analyze = vi.mocked(api.analyzeFiles);
const fetchSample = vi.mocked(api.fetchSampleDataset);
const fetchHealth = vi.mocked(api.fetchHealth);

function datasetAsOf(iso: string, version = '2', orders = 3): Dataset {
  const ds = makeDataset(
    Array.from({ length: orders }, (_, i) =>
      makeOrder(`o${i}`, i === 0 ? { stuck: makeStuck() } : {}),
    ),
    [],
  );
  return {
    ...ds,
    meta: { ...ds.meta, source: 'upload', asOf: Date.parse(iso), engineVersion: version },
  };
}

const sampleBase = datasetAsOf('2026-10-20T00:00:00Z', '2', 5);
const sample: Dataset = { ...sampleBase, meta: { ...sampleBase.meta, source: 'sample' } };

const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' });
const pairA = () => [csv('orders.csv', 'order_id\nA'), csv('kit_events.csv', 'kit_id\nA')];
const pairB = () => [csv('orders.csv', 'order_id\nB'), csv('kit_events.csv', 'kit_id\nB')];

/** A fresh app start: new Pinia, same browser storage. */
async function startApp() {
  setActivePinia(createPinia());
  const store = useDatasetStore();
  await store.init();
  return store;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.clearAllMocks();
  fetchSample.mockResolvedValue(sample);
  fetchHealth.mockResolvedValue({ status: 'ok', engineVersion: '2' });
  analyze.mockImplementation(async (_files, asOf) =>
    datasetAsOf(asOf ? `${asOf}T00:00:00Z` : '2026-10-19T12:00:00Z'),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dataset store', () => {
  it('starts on the sample when nothing is saved', async () => {
    const store = await startApp();
    expect(store.activeId).toBe(SAMPLE_ID);
    expect(store.dataset).toBe(sample);
    expect(store.entries.map((e) => e.kind)).toEqual(['sample']);
    expect(store.entries[0]?.orders).toBe(5);
  });

  it('saves an upload, opens it, and reopens it after a refresh', async () => {
    const store = await startApp();
    const result = await store.upload(pairA());
    expect(result.outcome).toBe('saved');
    expect(result.entry.name).toBe('Export as of 19 Oct 2026');
    expect(store.activeId).toBe(result.entry.id);
    expect(store.entries.map((e) => e.kind)).toEqual(['sample', 'saved']);
    expect(store.entries[1]).toMatchObject({
      orders: 3,
      stuck: 1,
      files: [{ name: 'orders.csv' }, { name: 'kit_events.csv' }],
    });

    analyze.mockClear();
    const after = await startApp();
    expect(after.activeId).toBe(result.entry.id);
    expect(after.dataset?.meta.asOf).toBe(Date.parse('2026-10-19T12:00:00Z'));
    expect(analyze).not.toHaveBeenCalled();
  });

  it('switches between datasets', async () => {
    const store = await startApp();
    const a = await store.upload(pairA());
    const b = await store.upload(pairB());
    expect(b.entry.name).toBe('Export as of 19 Oct 2026 (2)');
    await store.open(a.entry.id);
    expect(store.activeId).toBe(a.entry.id);
    await store.open(SAMPLE_ID);
    expect(store.dataset).toBe(sample);
    expect(fetchSample).toHaveBeenCalledTimes(1);
  });

  it('opens the saved copy instead of saving the same files twice', async () => {
    const store = await startApp();
    const first = await store.upload(pairA());
    await store.open(SAMPLE_ID);
    const [orders, events] = pairA();
    const again = await store.upload([events!, orders!]);
    expect(again.outcome).toBe('duplicate');
    expect(again.entry.id).toBe(first.entry.id);
    expect(store.activeId).toBe(first.entry.id);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(store.entries).toHaveLength(2);
  });

  it('removes a dataset, falls back to the sample, and can undo', async () => {
    const store = await startApp();
    const { entry } = await store.upload(pairA());
    await store.remove(entry.id);
    expect(store.activeId).toBe(SAMPLE_ID);
    expect(store.entries).toHaveLength(1);
    expect(store.lastRemoved?.meta.id).toBe(entry.id);
    expect(await storage.listSaved()).toHaveLength(0);

    await store.undoRemove();
    expect(store.lastRemoved).toBeNull();
    expect(store.entries.map((e) => e.id)).toContain(entry.id);
    // It was open when it was removed, so undo opens it again.
    expect(store.activeId).toBe(entry.id);
    expect(await storage.listSaved()).toHaveLength(1);
  });

  it('forgets the undo after a few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const store = await startApp();
    const { entry } = await store.upload(pairA());
    await store.remove(entry.id);
    expect(store.lastRemoved).not.toBeNull();
    vi.advanceTimersByTime(10_001);
    expect(store.lastRemoved).toBeNull();
  });

  it('never removes the sample', async () => {
    const store = await startApp();
    await store.remove(SAMPLE_ID);
    expect(store.entries).toHaveLength(1);
    expect(store.activeId).toBe(SAMPLE_ID);
  });

  it('keeps a custom name, and re-analyzes when the as-of date changes', async () => {
    const store = await startApp();
    const { entry } = await store.upload(pairA());
    await store.rename(entry.id, '  Hidden test set  ');
    await store.changeAsOf(entry.id, '2026-10-01');
    expect(analyze).toHaveBeenLastCalledWith(expect.any(Array), '2026-10-01');
    expect(store.dataset?.meta.asOf).toBe(Date.parse('2026-10-01T00:00:00Z'));

    const after = await startApp();
    expect(after.activeEntry).toMatchObject({
      name: 'Hidden test set',
      asOfOverride: '2026-10-01',
      asOf: Date.parse('2026-10-01T00:00:00Z'),
    });

    // Going back to the date from the files sends no as-of.
    await after.changeAsOf(entry.id, null);
    expect(analyze).toHaveBeenLastCalledWith(expect.any(Array), undefined);
    expect(after.activeEntry?.asOfOverride).toBeNull();
  });

  it('renames an auto-named dataset after its new as-of date', async () => {
    const store = await startApp();
    const { entry } = await store.upload(pairA());
    await store.changeAsOf(entry.id, '2026-09-30');
    expect(store.activeEntry?.name).toBe('Export as of 30 Sept 2026');
  });

  it('re-analyzes saved data that an older version of the rules produced', async () => {
    const store = await startApp();
    const { entry } = await store.upload(pairA());
    fetchHealth.mockResolvedValue({ status: 'ok', engineVersion: '3' });
    analyze.mockResolvedValue(datasetAsOf('2026-10-19T12:00:00Z', '3'));
    analyze.mockClear();

    const after = await startApp();
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(after.activeId).toBe(entry.id);
    expect(after.dataset?.meta.engineVersion).toBe('3');
    expect(after.notice).toContain('re-analyzed');
    expect((await storage.getPayload(entry.id))?.dataset.meta.engineVersion).toBe('3');
  });

  it('keeps an upload in memory when the browser cannot save it', async () => {
    // @ts-expect-error simulate a browser without IndexedDB
    globalThis.indexedDB = undefined;
    const store = await startApp();
    const result = await store.upload(pairA());
    expect(result).toMatchObject({ outcome: 'not_saved', reason: 'unavailable' });
    expect(store.activeId).toBe(result.entry.id);
    expect(store.entries[1]?.kind).toBe('unsaved');

    const after = await startApp();
    expect(after.activeId).toBe(SAMPLE_ID);
    expect(after.entries).toHaveLength(1);
  });

  it('keeps an upload in memory when browser storage is full', async () => {
    vi.mocked(storage.saveDataset).mockRejectedValueOnce(new storage.StorageFullError());
    const store = await startApp();
    const result = await store.upload(pairA());
    expect(result).toMatchObject({ outcome: 'not_saved', reason: 'full' });
    expect(store.dataset?.meta.asOf).toBe(Date.parse('2026-10-19T12:00:00Z'));
  });

  it('does not save anything when the server rejects the files', async () => {
    analyze.mockRejectedValueOnce(new api.ApiError(400, 'missing_columns', 'Missing occurred_at.'));
    const store = await startApp();
    await expect(store.upload(pairA())).rejects.toThrow('Missing occurred_at.');
    expect(store.activeId).toBe(SAMPLE_ID);
    expect(store.entries).toHaveLength(1);
    expect(store.busy).toBe(false);
  });

  it('falls back to the sample when the remembered dataset is gone', async () => {
    localStorage.setItem('kit-lifecycle-dashboard.active', 'no-such-id');
    const store = await startApp();
    expect(store.activeId).toBe(SAMPLE_ID);
  });
});
