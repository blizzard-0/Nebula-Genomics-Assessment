import type { Dataset } from '@contracts';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { analyzeFiles, ApiError, fetchHealth, fetchSampleDataset } from '@/api/client';
import { indexDataset } from '@/lib/dataset';
import { fmtDate } from '@/lib/format';
import { nextFrame, track } from '@/lib/loading';
import type { SavedFile, SavedMeta, SavedPayload } from '@/lib/savedDatasets';
import {
  getPayload,
  hashFiles,
  isStorageAvailable,
  listSaved,
  removeSaved,
  saveDataset,
  StorageFullError,
  updateMeta,
} from '@/lib/savedDatasets';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export const SAMPLE_ID = 'sample';
const ACTIVE_KEY = 'kit-lifecycle-dashboard.active';
const UNDO_MS = 10_000;

/** One row in the dataset list: the bundled sample, a saved upload, or an upload kept in memory. */
export interface DatasetEntry {
  id: string;
  name: string;
  kind: 'sample' | 'saved' | 'unsaved';
  asOf: number | null;
  /** As-of date picked by the user (YYYY-MM-DD); null means it comes from the data. */
  asOfOverride: string | null;
  orders: number | null;
  kits: number | null;
  stuck: number | null;
  files: { name: string; size: number }[];
  savedAt: number | null;
}

export type UploadResult =
  | { outcome: 'saved'; entry: DatasetEntry }
  | { outcome: 'duplicate'; entry: DatasetEntry }
  | { outcome: 'not_saved'; entry: DatasetEntry; reason: 'full' | 'unavailable' | 'error' };

interface MemoryDataset {
  meta: SavedMeta;
  payload: SavedPayload;
}

function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // Storage blocked: the app still works, it just won't remember the choice.
  }
}

function summarize(ds: Dataset): SavedMeta['summary'] {
  return {
    asOf: ds.meta.asOf,
    orders: ds.meta.counts.orders,
    kits: ds.meta.counts.kits,
    stuck: ds.orders.filter((o) => o.stuck && !o.isTest).length,
  };
}

function toFiles(saved: SavedFile[]): File[] {
  return saved.map((f) => new File([f.text], f.name, { type: 'text/csv' }));
}

const autoName = (asOf: number) => `Export as of ${fmtDate(asOf)}`;

function entryFromMeta(meta: SavedMeta, kind: 'saved' | 'unsaved'): DatasetEntry {
  return {
    id: meta.id,
    name: meta.name,
    kind,
    asOf: meta.summary.asOf,
    asOfOverride: meta.asOf,
    orders: meta.summary.orders,
    kits: meta.summary.kits,
    stuck: meta.summary.stuck,
    files: meta.files,
    savedAt: meta.savedAt,
  };
}

export const useDatasetStore = defineStore('dataset', () => {
  // Datasets are large and never mutated, so they are kept shallow (no deep proxies).
  const dataset = shallowRef<Dataset | null>(null);
  const sampleDataset = shallowRef<Dataset | null>(null);
  const activeId = ref<string>(SAMPLE_ID);
  // Plain objects (not deep proxies): IndexedDB can only store plain data.
  const saved = shallowRef<SavedMeta[]>([]);
  const memory = shallowRef<Map<string, MemoryDataset>>(new Map());
  const storageAvailable = ref<boolean | null>(null);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  const notice = ref<string | null>(null);
  // A counter, so nested actions (an upload that opens a dataset) cannot clear it early.
  const pending = ref(0);
  const busy = computed(() => pending.value > 0);
  /** Name of the dataset being opened, while it loads. */
  const switchingTo = ref<string | null>(null);
  const lastRemoved = shallowRef<{
    meta: SavedMeta;
    payload: SavedPayload;
    wasActive: boolean;
  } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  let engineVersion: string | null = null;

  const index = computed(() => (dataset.value ? indexDataset(dataset.value) : null));
  const isSample = computed(() => activeId.value === SAMPLE_ID);

  const entries = computed<DatasetEntry[]>(() => {
    const sample = sampleDataset.value;
    const sampleEntry: DatasetEntry = {
      id: SAMPLE_ID,
      name: 'Sample export',
      kind: 'sample',
      asOf: sample?.meta.asOf ?? Date.parse('2026-10-20T00:00:00Z'),
      asOfOverride: null,
      orders: sample?.meta.counts.orders ?? null,
      kits: sample?.meta.counts.kits ?? null,
      stuck: sample ? summarize(sample).stuck : null,
      files: [
        { name: 'orders.csv', size: 340_805 },
        { name: 'kit_events.csv', size: 1_833_238 },
      ],
      savedAt: null,
    };
    const unsaved = [...memory.value.values()].map((m) => entryFromMeta(m.meta, 'unsaved'));
    const stored = saved.value.map((m) => entryFromMeta(m, 'saved'));
    return [sampleEntry, ...unsaved, ...stored];
  });

  const activeEntry = computed(() => entries.value.find((e) => e.id === activeId.value) ?? null);

  async function currentEngineVersion(): Promise<string | null> {
    if (engineVersion) return engineVersion;
    try {
      engineVersion = (await fetchHealth()).engineVersion;
    } catch {
      return null;
    }
    return engineVersion;
  }

  function show(id: string, ds: Dataset): void {
    dataset.value = ds;
    activeId.value = id;
    status.value = 'ready';
    error.value = null;
    // Only remember datasets that will still exist after a refresh.
    writeActive(memory.value.has(id) ? SAMPLE_ID : id);
  }

  async function openSample(): Promise<void> {
    if (sampleDataset.value) {
      show(SAMPLE_ID, sampleDataset.value);
      return;
    }
    if (!dataset.value) status.value = 'loading';
    pending.value++;
    try {
      const ds = await fetchSampleDataset();
      sampleDataset.value = ds;
      show(SAMPLE_ID, ds);
    } catch (err) {
      error.value =
        err instanceof ApiError
          ? err.message
          : 'Could not reach the API. Check that the backend is running and try again.';
      if (!dataset.value) status.value = 'error';
    } finally {
      pending.value--;
    }
  }

  /** Re-runs the analysis for a stored dataset (new rules, or a new as-of date). */
  async function reanalyze(meta: SavedMeta, payload: SavedPayload): Promise<MemoryDataset> {
    const ds = await analyzeFiles(toFiles(payload.files), meta.asOf ?? undefined);
    const nextMeta: SavedMeta = {
      ...meta,
      name: meta.named ? meta.name : uniqueName(autoName(ds.meta.asOf), meta.id),
      summary: summarize(ds),
      engineVersion: ds.meta.engineVersion,
    };
    return { meta: nextMeta, payload: { ...payload, dataset: ds } };
  }

  async function persist(next: MemoryDataset): Promise<void> {
    if (memory.value.has(next.meta.id)) {
      const map = new Map(memory.value);
      map.set(next.meta.id, next);
      memory.value = map;
      return;
    }
    await saveDataset(next.meta, next.payload);
    saved.value = saved.value.map((m) => (m.id === next.meta.id ? next.meta : m));
  }

  async function open(id: string): Promise<void> {
    if (id === SAMPLE_ID) return openSample();
    const inMemory = memory.value.get(id);
    if (inMemory) {
      show(id, inMemory.payload.dataset);
      return;
    }
    const meta = saved.value.find((m) => m.id === id);
    if (!meta) return openSample();

    pending.value++;
    if (!dataset.value) status.value = 'loading';
    try {
      const payload = await getPayload(id);
      if (!payload) {
        notice.value = `"${meta.name}" could not be read from browser storage, so the sample is shown instead.`;
        await openSample();
        return;
      }
      let current: MemoryDataset = { meta, payload };
      const version = await currentEngineVersion();
      if (version && payload.dataset.meta.engineVersion !== version) {
        try {
          current = await reanalyze(meta, payload);
          await persist(current);
          notice.value = `"${current.meta.name}" was re-analyzed with the latest rules.`;
        } catch {
          notice.value = `"${meta.name}" was saved by an older version and couldn't be re-analyzed right now. Showing the saved result.`;
        }
      }
      show(id, current.payload.dataset);
    } catch {
      notice.value = `"${meta.name}" could not be opened, so the sample is shown instead.`;
      await openSample();
    } finally {
      pending.value--;
    }
  }

  /** Loads the saved list and reopens the dataset that was open last time. */
  async function init(): Promise<void> {
    if (status.value !== 'idle') return;
    status.value = 'loading';
    storageAvailable.value = await isStorageAvailable();
    if (storageAvailable.value) {
      try {
        saved.value = await listSaved();
      } catch {
        saved.value = [];
      }
    }
    const last = readActive();
    if (last && last !== SAMPLE_ID && saved.value.some((m) => m.id === last)) {
      await open(last);
    } else {
      await openSample();
    }
  }

  function uniqueName(base: string, exceptId?: string): string {
    const taken = new Set(entries.value.filter((e) => e.id !== exceptId).map((e) => e.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} (${n})`)) n++;
    return `${base} (${n})`;
  }

  /**
   * Analyzes two uploaded files, saves them in the browser and opens them.
   * Throws ApiError when the server rejects the files.
   */
  async function upload(files: File[], asOf?: string): Promise<UploadResult> {
    pending.value++;
    try {
      const texts = await Promise.all(files.map((f) => f.text()));
      const id = await hashFiles(texts);
      const existing = entries.value.find((e) => e.id === id);
      if (existing) {
        await open(id);
        return { outcome: 'duplicate', entry: existing };
      }

      const ds = await analyzeFiles(files, asOf);
      const meta: SavedMeta = {
        id,
        name: uniqueName(autoName(ds.meta.asOf)),
        named: false,
        savedAt: Date.now(),
        asOf: asOf ?? null,
        files: files.map((f) => ({ name: f.name, size: f.size })),
        summary: summarize(ds),
        engineVersion: ds.meta.engineVersion,
      };
      const payload: SavedPayload = {
        id,
        files: files.map((f, i) => ({ name: f.name, text: texts[i] ?? '' })),
        dataset: ds,
      };

      let reason: 'full' | 'unavailable' | 'error' | null = null;
      if (storageAvailable.value) {
        try {
          await saveDataset(meta, payload);
          saved.value = [meta, ...saved.value];
        } catch (err) {
          reason = err instanceof StorageFullError ? 'full' : 'error';
        }
      } else {
        reason = 'unavailable';
      }
      if (reason) {
        const map = new Map(memory.value);
        map.set(id, { meta, payload });
        memory.value = map;
      }
      show(id, ds);
      const entry = entryFromMeta(meta, reason ? 'unsaved' : 'saved');
      return reason ? { outcome: 'not_saved', entry, reason } : { outcome: 'saved', entry };
    } finally {
      pending.value--;
    }
  }

  function findStored(id: string): { meta: SavedMeta; inMemory: boolean } | null {
    const mem = memory.value.get(id);
    if (mem) return { meta: mem.meta, inMemory: true };
    const meta = saved.value.find((m) => m.id === id);
    return meta ? { meta, inMemory: false } : null;
  }

  async function rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim().slice(0, 80);
    const found = findStored(id);
    if (!found || !trimmed || trimmed === found.meta.name) return;
    const meta: SavedMeta = { ...found.meta, name: trimmed, named: true };
    if (found.inMemory) {
      const mem = memory.value.get(id);
      if (mem) await persist({ meta, payload: mem.payload });
    } else {
      await updateMeta(meta);
      saved.value = saved.value.map((m) => (m.id === id ? meta : m));
    }
  }

  /** Re-analyzes a saved dataset with a new as-of date (null = take it from the data). */
  async function changeAsOf(id: string, asOf: string | null): Promise<void> {
    const found = findStored(id);
    if (!found || found.meta.asOf === asOf) return;
    pending.value++;
    try {
      const payload = found.inMemory ? memory.value.get(id)?.payload : await getPayload(id);
      if (!payload) throw new Error('The saved files could not be read.');
      const next = await reanalyze({ ...found.meta, asOf }, payload);
      await persist(next);
      if (activeId.value === id) show(id, next.payload.dataset);
    } finally {
      pending.value--;
    }
  }

  async function remove(id: string): Promise<void> {
    if (id === SAMPLE_ID) return;
    const found = findStored(id);
    if (!found) return;
    if (found.inMemory) {
      const map = new Map(memory.value);
      map.delete(id);
      memory.value = map;
      lastRemoved.value = null;
    } else {
      const payload = await getPayload(id);
      await removeSaved(id);
      saved.value = saved.value.filter((m) => m.id !== id);
      const wasActive = activeId.value === id;
      lastRemoved.value = payload ? { meta: found.meta, payload, wasActive } : null;
      clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        lastRemoved.value = null;
      }, UNDO_MS);
    }
    if (activeId.value === id) await openSample();
  }

  async function undoRemove(): Promise<void> {
    const removed = lastRemoved.value;
    if (!removed) return;
    clearTimeout(undoTimer);
    lastRemoved.value = null;
    await saveDataset(removed.meta, removed.payload);
    saved.value = [...saved.value, removed.meta].sort((a, b) => b.savedAt - a.savedAt);
    // Undoing the removal of the open dataset puts you back where you were.
    if (removed.wasActive) show(removed.meta.id, removed.payload.dataset);
  }

  function dismissUndo(): void {
    clearTimeout(undoTimer);
    lastRemoved.value = null;
  }

  /** Opens a dataset with visible feedback: the page dims and names what is loading. */
  async function switchTo(id: string): Promise<void> {
    if (id === activeId.value && dataset.value) return;
    switchingTo.value = entries.value.find((e) => e.id === id)?.name ?? null;
    pending.value++;
    try {
      await nextFrame();
      await open(id);
    } finally {
      pending.value--;
      switchingTo.value = null;
    }
  }

  // Every action that makes the user wait also drives the top progress bar.
  const tracked =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      track(() => fn(...args));

  return {
    dataset,
    switchingTo,
    status,
    error,
    notice,
    busy,
    index,
    isSample,
    activeId,
    activeEntry,
    entries,
    storageAvailable,
    lastRemoved,
    init: tracked(init),
    open: tracked(switchTo),
    openSample: tracked(openSample),
    upload: tracked(upload),
    rename: tracked(rename),
    changeAsOf: tracked(changeAsOf),
    remove: tracked(remove),
    undoRemove: tracked(undoRemove),
    dismissUndo,
  };
});
