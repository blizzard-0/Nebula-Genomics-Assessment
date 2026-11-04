<script setup lang="ts">
import { onClickOutside, refDebounced } from '@vueuse/core';
import { Search } from 'lucide-vue-next';
import { computed, ref, useId, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { SearchHit } from '@/lib/dataset';
import { searchIds } from '@/lib/dataset';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const router = useRouter();

const query = ref('');
const debounced = refDebounced(query, 120);
const open = ref(false);
const active = ref(0);
const root = ref<HTMLElement | null>(null);
const listId = useId();

const hits = computed<SearchHit[]>(() =>
  store.dataset && store.index ? searchIds(store.dataset, store.index, debounced.value) : [],
);

watch(hits, () => {
  active.value = 0;
});

onClickOutside(root, () => {
  open.value = false;
});

function go(hit: SearchHit | undefined): void {
  if (!hit) return;
  open.value = false;
  query.value = '';
  void router.push({ name: 'order', params: { id: hit.orderId } });
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    open.value = true;
    active.value = Math.min(active.value + 1, hits.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    active.value = Math.max(active.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    go(hits.value[active.value]);
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  order: 'Order',
  kit: 'Kit',
  customer: 'Customer',
};
</script>

<template>
  <div ref="root" class="relative">
    <label class="sr-only" :for="`${listId}-input`">Find an order, kit or customer</label>
    <Search
      class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
      aria-hidden="true"
    />
    <input
      :id="`${listId}-input`"
      v-model="query"
      type="search"
      autocomplete="off"
      spellcheck="false"
      placeholder="Find order, kit or customer id"
      class="field w-full pl-8"
      role="combobox"
      :aria-expanded="open && hits.length > 0"
      :aria-controls="listId"
      :aria-activedescendant="open && hits.length ? `${listId}-${active}` : undefined"
      @focus="open = true"
      @input="open = true"
      @keydown="onKey"
    />
    <ul
      v-show="open && debounced.trim().length >= 2"
      :id="listId"
      role="listbox"
      class="absolute right-0 left-0 z-40 mt-1 max-h-80 overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
    >
      <li
        v-for="(hit, i) in hits"
        :id="`${listId}-${i}`"
        :key="`${hit.kind}-${hit.id}-${hit.orderId}`"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm"
        :class="i === active ? 'bg-accent-soft' : ''"
        @mousedown.prevent="go(hit)"
        @mouseenter="active = i"
      >
        <span class="w-16 shrink-0 text-xs text-muted">{{ KIND_LABEL[hit.kind] }}</span>
        <span class="id text-ink">{{ hit.id }}</span>
        <span class="truncate text-xs text-muted">{{ hit.label }}</span>
      </li>
      <li v-if="hits.length === 0" class="px-3 py-2 text-sm text-muted">
        No order, kit or customer id contains "{{ debounced.trim() }}".
      </li>
    </ul>
  </div>
</template>
