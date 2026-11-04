<script setup lang="ts">
import { LoaderCircle, X } from 'lucide-vue-next';
import { computed, onMounted, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import DatasetBanner from '@/components/DatasetBanner.vue';
import FilterBar from '@/components/FilterBar.vue';
import StateBlock from '@/components/StateBlock.vue';
import TopProgressBar from '@/components/TopProgressBar.vue';
import UndoToast from '@/components/UndoToast.vue';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const route = useRoute();

const FILTERED_ROUTES = new Set(['overview', 'turnaround', 'stuck']);
const showFilters = computed(() => FILTERED_ROUTES.has(String(route.name)));
// The Data page stays usable without a dataset so a new pair of files can still be loaded.
const needsData = computed(() => route.name !== 'data' && route.name !== 'not-found');

// The browser tab says which page and which dataset it shows.
watchEffect(() => {
  const page = typeof route.meta.title === 'string' ? route.meta.title : '';
  const id = typeof route.params.id === 'string' ? ` ${route.params.id}` : '';
  const parts = [page ? `${page}${id}` : '', store.activeEntry?.name ?? '', 'Kit Lifecycle'];
  document.title = parts.filter(Boolean).join(' · ');
});

onMounted(() => {
  void store.init();
});
</script>

<template>
  <TopProgressBar />
  <a
    href="#main"
    class="sr-only z-50 rounded bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Skip to content
  </a>
  <AppHeader />
  <FilterBar v-if="showFilters && store.dataset" />
  <main
    id="main"
    class="relative mx-auto w-full max-w-330 px-4 pt-5 pb-16 sm:px-6"
    :aria-busy="store.switchingTo ? 'true' : undefined"
  >
    <div
      v-if="store.notice"
      role="status"
      class="mb-4 flex items-start gap-3 rounded-lg border border-info/20 bg-info-soft px-4 py-2.5 text-sm text-info"
      data-testid="notice"
    >
      <p class="flex-1">{{ store.notice }}</p>
      <button
        type="button"
        class="rounded p-0.5 hover:bg-info/10"
        aria-label="Dismiss"
        @click="store.notice = null"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
    <DatasetBanner v-if="route.name !== 'not-found'" />

    <StateBlock
      v-if="needsData && store.status === 'loading' && !store.dataset"
      kind="loading"
      title="Loading the data"
      message="Parsing the orders and their kit events."
    />
    <StateBlock
      v-else-if="needsData && store.status === 'error' && !store.dataset"
      kind="error"
      title="The dataset could not be loaded"
      :message="store.error ?? ''"
    >
      <button type="button" class="btn btn-primary" @click="store.openSample()">Try again</button>
      <RouterLink to="/data" class="btn">Upload files instead</RouterLink>
    </StateBlock>
    <div
      v-else-if="!needsData || store.dataset"
      class="transition-opacity duration-150"
      :class="store.switchingTo ? 'pointer-events-none opacity-40' : ''"
    >
      <RouterView />
    </div>

    <div
      v-if="store.switchingTo"
      class="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center px-4"
      role="status"
      data-testid="switching"
    >
      <p
        class="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-lg"
      >
        <LoaderCircle class="size-4 animate-spin text-accent" aria-hidden="true" />
        Opening "{{ store.switchingTo }}"…
      </p>
    </div>
  </main>
  <UndoToast />
</template>
