<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { Check, ChevronDown, LoaderCircle } from 'lucide-vue-next';
import { computed, nextTick, ref, useId } from 'vue';
import { datasetColor, datasetKindLabel } from '@/lib/datasetColor';
import { fmtDate, fmtInt } from '@/lib/format';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const id = useId();

onClickOutside(root, () => {
  open.value = false;
});

const label = computed(() => store.activeEntry?.name ?? 'Loading…');
const asOf = computed(() => store.dataset?.meta.asOf ?? store.activeEntry?.asOf ?? null);
const color = computed(() => datasetColor(store.activeId));
// The kind of data, plus the date unless an auto-named upload already carries it in its name.
const subtitle = computed(() => {
  const kind = store.activeEntry ? datasetKindLabel(store.activeEntry.kind) : '';
  if (!asOf.value) return kind;
  const date = fmtDate(asOf.value);
  return label.value.includes(date) ? kind : `${kind}, as of ${date}`;
});

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    list.value?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }
}

async function choose(entryId: string): Promise<void> {
  open.value = false;
  if (entryId !== store.activeId) await store.open(entryId);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    open.value = false;
    root.value?.querySelector('button')?.focus();
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...(list.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
  items[next]?.focus();
}
</script>

<template>
  <div ref="root" class="relative" @keydown="onKey">
    <button
      type="button"
      class="field flex max-w-full items-center gap-2.5 py-1.5 text-left"
      :style="{ borderLeft: `4px solid ${color}` }"
      :aria-expanded="open"
      :aria-controls="id"
      aria-haspopup="menu"
      data-testid="dataset-picker"
      @click="toggle"
    >
      <LoaderCircle
        v-if="store.busy"
        class="size-4 shrink-0 animate-spin text-accent"
        aria-hidden="true"
      />
      <span
        v-else
        class="size-3 shrink-0 rounded-full"
        :style="{ background: color }"
        aria-hidden="true"
      />
      <span class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-sm font-semibold" data-testid="dataset-name">{{ label }}</span>
        <span v-if="subtitle" class="truncate text-[0.7rem] font-medium" :style="{ color }">
          {{ subtitle }}
        </span>
      </span>
      <ChevronDown class="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />
      <span class="sr-only">, change dataset</span>
    </button>

    <div
      v-show="open"
      :id="id"
      ref="list"
      role="menu"
      aria-label="Datasets"
      class="absolute right-0 z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-1 shadow-lg"
    >
      <div class="max-h-80 overflow-auto">
        <button
          v-for="entry in store.entries"
          :key="entry.id"
          type="button"
          role="menuitemradio"
          :aria-checked="entry.id === store.activeId"
          class="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left hover:bg-paper focus-visible:bg-paper"
          :data-dataset-id="entry.id"
          @click="choose(entry.id)"
        >
          <span
            class="mt-1 size-2.5 shrink-0 rounded-full"
            :style="{ background: datasetColor(entry.id) }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-sm font-medium">{{ entry.name }}</span>
              <span
                v-if="entry.kind === 'sample'"
                class="shrink-0 rounded bg-paper px-1 text-[0.65rem] text-muted ring-1 ring-line"
              >
                built in
              </span>
              <span
                v-else-if="entry.kind === 'unsaved'"
                class="shrink-0 rounded bg-warn-soft px-1 text-[0.65rem] text-warn"
              >
                not saved
              </span>
            </span>
            <span class="block text-xs text-muted">
              <template v-if="entry.asOf">As of {{ fmtDate(entry.asOf) }}</template
              ><template v-if="entry.orders !== null">, {{ fmtInt(entry.orders) }} orders</template>
            </span>
          </span>
          <Check
            class="mt-0.5 size-4 shrink-0"
            :class="entry.id === store.activeId ? 'text-accent' : 'invisible'"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="mt-1 border-t border-line pt-1">
        <RouterLink
          to="/data"
          class="block rounded-md px-2.5 py-2 text-sm text-accent no-underline hover:bg-paper"
          role="menuitem"
          @click="open = false"
        >
          Add or manage datasets
        </RouterLink>
      </div>
    </div>
  </div>
</template>
