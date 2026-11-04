<script setup lang="ts">
import { computed } from 'vue';
import DatasetPicker from '@/components/DatasetPicker.vue';
import GlobalSearch from '@/components/GlobalSearch.vue';
import { useFilters } from '@/composables/useFilters';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const { filterQuery } = useFilters();

const stuckCount = computed(
  () => store.dataset?.orders.filter((o) => o.stuck && !o.isTest).length ?? null,
);
const issueCount = computed(
  () => store.dataset?.quality.filter((q) => q.level !== 'info').length ?? null,
);

const links = computed(() => [
  { name: 'overview', label: 'Overview', to: { path: '/', query: filterQuery.value } },
  {
    name: 'turnaround',
    label: 'Turnaround',
    to: { path: '/turnaround', query: filterQuery.value },
  },
  {
    name: 'stuck',
    label: 'Stuck kits',
    to: { path: '/stuck', query: filterQuery.value },
    badge: stuckCount.value,
  },
  { name: 'data', label: 'Data', to: { path: '/data' }, badge: issueCount.value, quiet: true },
]);

const asOfTitle = computed(() => {
  const meta = store.dataset?.meta;
  if (!meta) return '';
  const how = {
    export_date: 'export date stated with the sample',
    latest_timestamp: 'latest timestamp in the files',
    override: 'set by you for this dataset',
  }[meta.asOfSource];
  return `Days waiting are measured to this instant (${how}).`;
});
</script>

<template>
  <header class="border-b border-line bg-surface">
    <div class="mx-auto flex max-w-330 flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
      <RouterLink
        to="/"
        class="flex items-center gap-2.5 text-ink no-underline"
        aria-label="Kit Lifecycle Dashboard, overview"
      >
        <svg viewBox="0 0 32 32" class="size-7 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="var(--color-accent-strong)" />
          <path
            d="M7 21h4l2.5-9 4 13 2.5-8H25"
            fill="none"
            stroke="#fff"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="text-[0.95rem] leading-tight font-semibold">Kit Lifecycle</span>
      </RouterLink>

      <div class="order-3 flex w-full items-center gap-2 sm:order-0 sm:ml-auto sm:w-auto sm:gap-3">
        <GlobalSearch class="min-w-0 flex-1 sm:w-64 sm:flex-none" />
        <DatasetPicker class="max-w-[48%] shrink-0 sm:max-w-64" :title="asOfTitle" />
      </div>

      <nav
        class="order-2 -mx-2 -mb-px flex w-full [scrollbar-width:none] gap-0.5 overflow-x-auto sm:order-0 sm:mx-0 sm:gap-1"
        aria-label="Main"
      >
        <RouterLink
          v-for="link in links"
          :key="link.name"
          :to="link.to"
          class="flex shrink-0 items-center gap-1.5 border-b-2 px-2 pt-1 pb-2.5 text-sm font-medium no-underline transition-colors sm:px-3"
          :class="
            $route.name === link.name
              ? 'border-accent text-ink'
              : 'border-transparent text-muted hover:text-ink'
          "
          :aria-current="$route.name === link.name ? 'page' : undefined"
        >
          {{ link.label }}
          <span
            v-if="link.badge"
            class="rounded-full px-1.5 py-px text-[0.7rem] leading-4 font-semibold"
            :class="link.quiet ? 'bg-paper text-muted' : 'bg-bad-soft text-bad'"
          >
            {{ link.badge }}
          </span>
        </RouterLink>
      </nav>
    </div>
  </header>
</template>
