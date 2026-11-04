<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from '@/components/AppHeader.vue';
import FilterBar from '@/components/FilterBar.vue';
import StateBlock from '@/components/StateBlock.vue';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const route = useRoute();

const FILTERED_ROUTES = new Set(['overview', 'turnaround', 'stuck']);
const showFilters = computed(() => FILTERED_ROUTES.has(String(route.name)));
// The Data page stays usable without a dataset so a new pair of files can still be loaded.
const needsData = computed(() => route.name !== 'data' && route.name !== 'not-found');

onMounted(() => {
  void store.ensureLoaded();
});
</script>

<template>
  <a
    href="#main"
    class="sr-only z-50 rounded bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  >
    Skip to content
  </a>
  <AppHeader />
  <FilterBar v-if="showFilters && store.dataset" />
  <main id="main" class="mx-auto w-full max-w-330 px-4 pt-5 pb-16 sm:px-6">
    <StateBlock
      v-if="needsData && store.status === 'loading' && !store.dataset"
      kind="loading"
      title="Loading the sample export"
      message="Parsing 5,000 orders and their kit events."
    />
    <StateBlock
      v-else-if="needsData && store.status === 'error' && !store.dataset"
      kind="error"
      title="The dataset could not be loaded"
      :message="store.error ?? ''"
    >
      <button type="button" class="btn btn-primary" @click="store.loadSample()">Try again</button>
      <RouterLink to="/data" class="btn">Upload files instead</RouterLink>
    </StateBlock>
    <RouterView v-else-if="!needsData || store.dataset" />
  </main>
</template>
