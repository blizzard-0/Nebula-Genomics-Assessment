<script setup lang="ts">
import { computed } from 'vue';
import { datasetColor, datasetKindLabel } from '@/lib/datasetColor';
import { fmtDate, fmtInt } from '@/lib/format';
import { useDatasetStore } from '@/stores/dataset';

/** Shows which dataset every page is about, in that dataset's color. */
const store = useDatasetStore();

const entry = computed(() => store.activeEntry);
const color = computed(() => (entry.value ? datasetColor(entry.value.id) : 'transparent'));
const asOf = computed(() => store.dataset?.meta.asOf ?? entry.value?.asOf ?? null);
const orders = computed(() => store.dataset?.meta.counts.orders ?? entry.value?.orders ?? null);
</script>

<template>
  <div
    v-if="entry && store.dataset"
    class="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface py-2 pr-3 pl-3"
    :style="{ borderLeft: `4px solid ${color}` }"
    data-testid="dataset-banner"
  >
    <span class="text-xs text-muted">Viewing</span>
    <span class="flex min-w-0 items-center gap-2">
      <span
        class="size-2.5 shrink-0 rounded-full"
        :style="{ background: color }"
        aria-hidden="true"
      />
      <span class="truncate text-sm font-semibold" data-testid="banner-name">{{ entry.name }}</span>
    </span>
    <span
      class="rounded px-1.5 py-px text-xs font-medium"
      :style="{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }"
    >
      {{ datasetKindLabel(entry.kind) }}
    </span>
    <span class="text-xs text-muted">
      <template v-if="orders !== null">{{ fmtInt(orders) }} orders</template
      ><template v-if="orders !== null && asOf">, </template
      ><template v-if="asOf">as of {{ fmtDate(asOf) }}</template>
    </span>
    <RouterLink
      v-if="$route.name !== 'data'"
      to="/data"
      class="ml-auto text-xs text-accent underline-offset-2 hover:underline"
    >
      Switch or add data
    </RouterLink>
  </div>
</template>
