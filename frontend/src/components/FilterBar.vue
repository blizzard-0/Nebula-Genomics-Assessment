<script setup lang="ts">
import { computed } from 'vue';
import MultiSelect from '@/components/MultiSelect.vue';
import { useFilteredData } from '@/composables/useFilteredData';
import { useFilters } from '@/composables/useFilters';
import type { DatePreset } from '@/lib/filters';
import { activeFilterCount } from '@/lib/filters';
import { fmtInt, isoDate, productLabel, statusLabel } from '@/lib/format';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const { filters, setFilters, resetFilters } = useFilters();
const { orders } = useFilteredData();

const products = computed(() =>
  (store.index?.products ?? []).map((p) => ({ value: p, label: productLabel(p) })),
);
const countries = computed(() =>
  (store.index?.countries ?? []).map((c) => ({ value: c, label: c })),
);
const statuses = computed(() =>
  (store.index?.statuses ?? []).map((s) => ({ value: s, label: statusLabel(s) })),
);

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '90d', label: '90 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

function setPreset(preset: DatePreset): void {
  if (preset === 'custom') {
    const asOf = store.dataset?.meta.asOf ?? Date.now();
    setFilters({
      preset,
      from: filters.value.from || isoDate(asOf - 30 * 86_400_000),
      to: filters.value.to || isoDate(asOf),
    });
  } else {
    setFilters({ preset, from: '', to: '' });
  }
}

const active = computed(() => activeFilterCount(filters.value));
const total = computed(() => store.dataset?.orders.length ?? 0);
</script>

<template>
  <section
    class="top-0 z-20 border-b border-line bg-paper/95 backdrop-blur sm:sticky"
    aria-label="Filters"
  >
    <div class="mx-auto flex max-w-330 flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
      <div
        class="flex rounded-lg border border-line-strong bg-surface p-0.5"
        role="radiogroup"
        aria-label="Order date"
      >
        <button
          v-for="p in PRESETS"
          :key="p.value"
          type="button"
          role="radio"
          :aria-checked="filters.preset === p.value"
          class="rounded-md px-2.5 py-1 text-sm transition-colors"
          :class="
            filters.preset === p.value ? 'bg-accent text-white' : 'text-ink-soft hover:bg-paper'
          "
          @click="setPreset(p.value)"
        >
          {{ p.label }}
        </button>
      </div>
      <template v-if="filters.preset === 'custom'">
        <label class="flex items-center gap-1.5 text-sm">
          <span class="text-muted">From</span>
          <input
            type="date"
            class="field py-1"
            :value="filters.from"
            :max="filters.to || undefined"
            @change="setFilters({ from: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label class="flex items-center gap-1.5 text-sm">
          <span class="text-muted">To</span>
          <input
            type="date"
            class="field py-1"
            :value="filters.to"
            :min="filters.from || undefined"
            @change="setFilters({ to: ($event.target as HTMLInputElement).value })"
          />
        </label>
      </template>

      <MultiSelect
        label="Product"
        :options="products"
        :model-value="filters.products"
        @update:model-value="setFilters({ products: $event })"
      />
      <MultiSelect
        label="Country"
        :options="countries"
        :model-value="filters.countries"
        @update:model-value="setFilters({ countries: $event })"
      />
      <MultiSelect
        label="Status"
        :options="statuses"
        :model-value="filters.statuses"
        @update:model-value="setFilters({ statuses: $event })"
      />
      <label class="flex cursor-pointer items-center gap-2 px-1 text-sm select-none">
        <input
          type="checkbox"
          class="size-4 accent-accent"
          :checked="filters.includeTest"
          @change="setFilters({ includeTest: ($event.target as HTMLInputElement).checked })"
        />
        Include test orders
      </label>

      <div class="ml-auto flex items-center gap-3 text-sm">
        <span class="text-muted" aria-live="polite">
          <span class="font-medium text-ink">{{ fmtInt(orders.length) }}</span>
          of {{ fmtInt(total) }} orders
        </span>
        <button
          v-if="active > 0"
          type="button"
          class="text-accent underline-offset-2 hover:underline"
          @click="resetFilters()"
        >
          Clear filters
        </button>
      </div>
    </div>
  </section>
</template>
