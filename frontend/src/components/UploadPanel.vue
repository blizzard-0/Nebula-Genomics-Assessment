<script setup lang="ts">
import { useDropZone } from '@vueuse/core';
import { FileText, UploadCloud, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { ApiError } from '@/api/client';
import { fmtInt } from '@/lib/format';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();

const files = ref<File[]>([]);
const asOf = ref('');
const error = ref<{ message: string; hint?: string } | null>(null);
const success = ref<string | null>(null);
const dropRef = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);

const MAX_BYTES = 4 * 1024 * 1024;

function addFiles(list: FileList | File[] | null): void {
  if (!list) return;
  error.value = null;
  success.value = null;
  const incoming = [...list];
  const rejected = incoming.filter((f) => !/\.(csv|txt)$/i.test(f.name));
  if (rejected.length) {
    error.value = { message: `${rejected.map((f) => f.name).join(', ')} is not a CSV file.` };
  }
  const merged = [...files.value, ...incoming.filter((f) => !rejected.includes(f))];
  // Keep the last two, replacing a file with the same name.
  const byName = new Map(merged.map((f) => [f.name, f]));
  files.value = [...byName.values()].slice(-2);
}

const { isOverDropZone } = useDropZone(dropRef, { onDrop: (dropped) => addFiles(dropped) });

function remove(name: string): void {
  files.value = files.value.filter((f) => f.name !== name);
}

const totalBytes = computed(() => files.value.reduce((sum, f) => sum + f.size, 0));
const tooBig = computed(() => totalBytes.value > MAX_BYTES);
const canSubmit = computed(() => files.value.length === 2 && !tooBig.value && !store.uploading);

const HINTS: Record<string, string> = {
  missing_columns: 'Both exports need the columns from the brief. Column order does not matter.',
  duplicate_file_type: 'Pick one orders file and one kit events file.',
  unrecognized_file:
    'The file is identified by its header row, so the first line must hold the column names.',
  file_too_large: 'Together the two files must be 4 MB or smaller.',
  invalid_as_of: 'Use the date picker, or leave it empty to use the latest timestamp in the files.',
};

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  error.value = null;
  success.value = null;
  try {
    const ds = await store.upload(files.value, asOf.value || undefined);
    success.value = `Loaded ${fmtInt(ds.meta.counts.orders)} orders and ${fmtInt(ds.meta.counts.kits)} kits. Every page now shows the uploaded data.`;
    files.value = [];
    if (input.value) input.value.value = '';
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = { message: err.message, hint: HINTS[err.code] };
    } else {
      error.value = {
        message: 'The upload did not reach the server. Check your connection and try again.',
      };
    }
  }
}

async function resetToSample(): Promise<void> {
  error.value = null;
  success.value = null;
  await store.loadSample();
  success.value = 'Back on the sample export.';
}

const fmtSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
</script>

<template>
  <section class="panel p-4 sm:p-5" aria-labelledby="upload-title">
    <h2 id="upload-title" class="panel-title">Load another export</h2>
    <p class="panel-note mt-0.5">
      Drop the orders CSV and the kit events CSV, in any order. Each file is recognized by its
      header, and nothing is stored on the server.
    </p>

    <form class="mt-4 flex flex-col gap-4" @submit.prevent="submit">
      <div
        ref="dropRef"
        class="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors"
        :class="isOverDropZone ? 'border-accent bg-accent-soft' : 'border-line-strong bg-paper'"
      >
        <UploadCloud class="size-7 text-accent" aria-hidden="true" />
        <p class="text-sm">
          Drag both files here, or
          <button
            type="button"
            class="font-medium text-accent underline underline-offset-2"
            @click="input?.click()"
          >
            choose files
          </button>
        </p>
        <p class="text-xs text-muted">CSV, up to 4 MB for both files together</p>
        <input
          ref="input"
          type="file"
          accept=".csv,text/csv"
          multiple
          class="sr-only"
          aria-label="Choose CSV files"
          data-testid="file-input"
          @change="addFiles(($event.target as HTMLInputElement).files)"
        />
      </div>

      <ul v-if="files.length" class="flex flex-col gap-1.5">
        <li
          v-for="f in files"
          :key="f.name"
          class="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm"
        >
          <FileText class="size-4 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ f.name }}</span>
          <span class="text-xs text-muted">{{ fmtSize(f.size) }}</span>
          <button
            type="button"
            class="rounded p-0.5 text-muted hover:text-ink"
            @click="remove(f.name)"
          >
            <X class="size-4" aria-hidden="true" /><span class="sr-only">Remove {{ f.name }}</span>
          </button>
        </li>
      </ul>
      <p v-if="files.length === 1" class="text-xs text-muted">Add the second file to continue.</p>
      <p v-if="tooBig" class="text-xs text-bad" role="alert">
        Together the files are {{ fmtSize(totalBytes) }}. The limit is 4 MB for both files.
      </p>

      <label class="flex flex-col gap-1 text-sm sm:max-w-xs">
        <span>As-of date <span class="text-muted">(optional)</span></span>
        <input v-model="asOf" type="date" class="field" />
        <span class="text-xs text-muted">
          When the export was taken (00:00 UTC). Left empty, the latest timestamp in the files is
          used.
        </span>
      </label>

      <div
        v-if="error"
        role="alert"
        class="rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad"
        data-testid="upload-error"
      >
        <p class="font-medium">{{ error.message }}</p>
        <p v-if="error.hint" class="mt-0.5 text-bad/80">{{ error.hint }}</p>
      </div>
      <p
        v-if="success"
        role="status"
        class="rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok"
        data-testid="upload-success"
      >
        {{ success }}
        <RouterLink
          v-if="!store.isSample"
          to="/"
          class="ml-1 font-medium underline underline-offset-2"
        >
          Open the overview
        </RouterLink>
      </p>

      <div class="flex flex-wrap gap-2">
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
          {{ store.uploading ? 'Analyzing…' : 'Analyze files' }}
        </button>
        <button
          v-if="!store.isSample"
          type="button"
          class="btn"
          :disabled="store.uploading || store.status === 'loading'"
          @click="resetToSample"
        >
          Reset to sample
        </button>
      </div>
    </form>
  </section>
</template>
