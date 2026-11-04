<script setup lang="ts">
import { LoaderCircle, Pencil, Trash2 } from 'lucide-vue-next';
import { nextTick, onMounted, ref, watch } from 'vue';
import { ApiError } from '@/api/client';
import { datasetColor } from '@/lib/datasetColor';
import { fmtDate, fmtInt, isoDate } from '@/lib/format';
import { storageEstimate } from '@/lib/savedDatasets';
import type { DatasetEntry } from '@/stores/dataset';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();

const editingId = ref<string | null>(null);
const draftName = ref('');
const nameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const asOfDraft = ref<Record<string, string>>({});
const rowError = ref<{ id: string; message: string } | null>(null);
const workingId = ref<string | null>(null);
const openingId = ref<string | null>(null);
const removingId = ref<string | null>(null);
const usage = ref<{ usage: number; quota: number } | null>(null);

async function refreshUsage(): Promise<void> {
  usage.value = await storageEstimate();
}
onMounted(refreshUsage);
watch(() => store.entries.length, refreshUsage);

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} KB`;

function fileLine(entry: DatasetEntry): string {
  const files = entry.files.map((f) => f.name).join(' and ');
  return entry.savedAt ? `${files}, saved ${fmtDate(entry.savedAt)}` : files;
}

async function startRename(entry: DatasetEntry): Promise<void> {
  editingId.value = entry.id;
  draftName.value = entry.name;
  await nextTick();
  const el = Array.isArray(nameInput.value) ? nameInput.value[0] : nameInput.value;
  el?.focus();
  el?.select();
}

async function saveRename(entry: DatasetEntry): Promise<void> {
  if (editingId.value !== entry.id) return;
  editingId.value = null;
  try {
    await store.rename(entry.id, draftName.value);
  } catch {
    rowError.value = { id: entry.id, message: 'The new name could not be saved.' };
  }
}

/** The date the dataset is evaluated at now, as YYYY-MM-DD. */
function currentAsOf(entry: DatasetEntry): string {
  return entry.asOfOverride ?? (entry.asOf ? isoDate(entry.asOf) : '');
}

function shownAsOf(entry: DatasetEntry): string {
  return asOfDraft.value[entry.id] ?? currentAsOf(entry);
}

function asOfChanged(entry: DatasetEntry): boolean {
  const draft = asOfDraft.value[entry.id];
  return draft !== undefined && draft !== '' && draft !== currentAsOf(entry);
}

async function applyAsOf(entry: DatasetEntry, value: string | null): Promise<void> {
  rowError.value = null;
  workingId.value = entry.id;
  try {
    await store.changeAsOf(entry.id, value || null);
    delete asOfDraft.value[entry.id];
  } catch (err) {
    rowError.value = {
      id: entry.id,
      message:
        err instanceof ApiError
          ? err.message
          : 'The dataset could not be re-analyzed. Check your connection and try again.',
    };
  } finally {
    workingId.value = null;
  }
}

async function removeEntry(entry: DatasetEntry): Promise<void> {
  rowError.value = null;
  removingId.value = entry.id;
  try {
    await store.remove(entry.id);
  } catch {
    rowError.value = { id: entry.id, message: 'The dataset could not be removed.' };
  } finally {
    removingId.value = null;
  }
}

async function openEntry(entry: DatasetEntry): Promise<void> {
  rowError.value = null;
  openingId.value = entry.id;
  try {
    await store.open(entry.id);
  } finally {
    openingId.value = null;
  }
}
</script>

<template>
  <section class="panel overflow-hidden" aria-labelledby="datasets-title">
    <div class="px-4 pt-4 pb-3 sm:px-5">
      <h2 id="datasets-title" class="panel-title">Your datasets</h2>
      <p class="panel-note">
        Uploads are saved in this browser, so they are still here after a refresh. Other people and
        other browsers don't see them.
      </p>
    </div>

    <ul class="divide-y divide-line border-t border-line" data-testid="dataset-list">
      <li
        v-for="entry in store.entries"
        :key="entry.id"
        class="grid gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_22rem_12rem]"
        :class="entry.id === store.activeId ? 'bg-accent-soft/40' : ''"
        :data-dataset-id="entry.id"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <form
              v-if="editingId === entry.id"
              class="flex items-center gap-2"
              @submit.prevent="saveRename(entry)"
            >
              <label class="sr-only" :for="`name-${entry.id}`">Dataset name</label>
              <input
                :id="`name-${entry.id}`"
                ref="nameInput"
                v-model="draftName"
                class="field w-64 max-w-full py-1"
                maxlength="80"
                @blur="saveRename(entry)"
                @keydown.esc="editingId = null"
              />
            </form>
            <template v-else>
              <span
                class="size-2.5 shrink-0 rounded-full"
                :style="{ background: datasetColor(entry.id) }"
                aria-hidden="true"
              />
              <p class="truncate text-sm font-medium" data-testid="entry-name">{{ entry.name }}</p>
              <button
                v-if="entry.kind !== 'sample'"
                type="button"
                class="rounded p-0.5 text-muted hover:text-ink"
                :aria-label="`Rename ${entry.name}`"
                @click="startRename(entry)"
              >
                <Pencil class="size-3.5" aria-hidden="true" />
              </button>
            </template>
            <span
              v-if="entry.kind === 'sample'"
              class="rounded bg-paper px-1.5 text-xs text-muted ring-1 ring-line"
            >
              built in
            </span>
            <span
              v-if="entry.kind === 'unsaved'"
              class="rounded bg-warn-soft px-1.5 text-xs text-warn"
              title="Kept in memory only: it disappears when you refresh."
            >
              not saved
            </span>
            <span
              v-if="entry.id === store.activeId"
              class="rounded bg-accent px-1.5 text-xs text-white"
            >
              showing now
            </span>
          </div>
          <p class="mt-0.5 text-xs text-muted">
            {{ fileLine(entry) }}
          </p>
          <p v-if="entry.orders !== null" class="mt-1 text-xs text-ink-soft">
            {{ fmtInt(entry.orders) }} orders, {{ fmtInt(entry.kits) }} kits,
            <span :class="entry.stuck ? 'text-bad' : ''">{{ fmtInt(entry.stuck) }} stuck</span>
          </p>
        </div>

        <div class="text-sm">
          <p class="text-xs text-muted">As of</p>
          <template v-if="entry.kind === 'sample'">
            <p>{{ fmtDate(entry.asOf) }} <span class="text-muted">(from the brief)</span></p>
          </template>
          <form
            v-else
            class="mt-0.5 flex flex-wrap items-center gap-2"
            @submit.prevent="applyAsOf(entry, asOfDraft[entry.id] ?? null)"
          >
            <label class="sr-only" :for="`asof-${entry.id}`">As-of date for {{ entry.name }}</label>
            <input
              :id="`asof-${entry.id}`"
              type="date"
              class="field py-1"
              :value="shownAsOf(entry)"
              @input="asOfDraft[entry.id] = ($event.target as HTMLInputElement).value"
            />
            <button
              v-if="asOfChanged(entry)"
              type="submit"
              class="btn py-1"
              :disabled="workingId === entry.id"
            >
              <LoaderCircle
                v-if="workingId === entry.id"
                class="size-4 animate-spin"
                aria-hidden="true"
              />
              {{ workingId === entry.id ? 'Re-analyzing…' : 'Apply' }}
            </button>
            <button
              v-if="entry.asOfOverride && workingId !== entry.id"
              type="button"
              class="text-xs text-accent underline-offset-2 hover:underline"
              @click="applyAsOf(entry, null)"
            >
              Use the files' latest date
            </button>
            <span v-if="!entry.asOfOverride && !asOfChanged(entry)" class="text-xs text-muted">
              latest date in the files
            </span>
          </form>
        </div>

        <div class="flex items-start gap-2 lg:justify-end">
          <button
            v-if="entry.id !== store.activeId"
            type="button"
            class="btn py-1"
            :disabled="store.busy"
            @click="openEntry(entry)"
          >
            <LoaderCircle
              v-if="openingId === entry.id"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            {{ openingId === entry.id ? 'Opening…' : 'Open' }}
          </button>
          <button
            v-if="entry.kind !== 'sample'"
            type="button"
            class="btn py-1 text-bad"
            :aria-label="`Remove ${entry.name}`"
            :disabled="removingId === entry.id"
            data-testid="remove-dataset"
            @click="removeEntry(entry)"
          >
            <LoaderCircle
              v-if="removingId === entry.id"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            <Trash2 v-else class="size-4" aria-hidden="true" />
            {{ removingId === entry.id ? 'Removing…' : 'Remove' }}
          </button>
        </div>

        <p v-if="rowError?.id === entry.id" role="alert" class="text-sm text-bad lg:col-span-3">
          {{ rowError.message }}
        </p>
      </li>
    </ul>

    <p
      class="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5"
      data-testid="storage-note"
    >
      <template v-if="store.storageAvailable === false">
        This browser doesn't allow saving data for this site, so uploads are only kept until you
        refresh.
      </template>
      <template v-else-if="usage">
        Browser storage used by this app: {{ fmtSize(usage.usage) }} of {{ fmtSize(usage.quota) }}
        available.
      </template>
      <template v-else>Uploads are saved in this browser's storage.</template>
    </p>
  </section>
</template>
