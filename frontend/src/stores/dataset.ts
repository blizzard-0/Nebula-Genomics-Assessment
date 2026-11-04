import type { Dataset } from '@contracts';
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { analyzeFiles, ApiError, fetchSampleDataset } from '@/api/client';
import { indexDataset } from '@/lib/dataset';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export const useDatasetStore = defineStore('dataset', () => {
  // The dataset is large and never mutated, so it is kept shallow (no deep proxies).
  const dataset = shallowRef<Dataset | null>(null);
  const status = ref<LoadStatus>('idle');
  const error = ref<string | null>(null);
  const uploading = ref(false);

  const index = computed(() => (dataset.value ? indexDataset(dataset.value) : null));
  const isSample = computed(() => dataset.value?.meta.source === 'sample');

  async function loadSample(): Promise<void> {
    status.value = 'loading';
    error.value = null;
    try {
      dataset.value = await fetchSampleDataset();
      status.value = 'ready';
    } catch (err) {
      error.value =
        err instanceof ApiError
          ? err.message
          : 'Could not reach the API. Check that the backend is running and try again.';
      status.value = 'error';
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (status.value === 'idle' || status.value === 'error') await loadSample();
  }

  /** Replaces the dataset with an analysis of the uploaded files. Throws ApiError on rejection. */
  async function upload(files: File[], asOf?: string): Promise<Dataset> {
    uploading.value = true;
    try {
      const next = await analyzeFiles(files, asOf);
      dataset.value = next;
      status.value = 'ready';
      error.value = null;
      return next;
    } finally {
      uploading.value = false;
    }
  }

  return { dataset, status, error, uploading, index, isSample, loadSample, ensureLoaded, upload };
});
