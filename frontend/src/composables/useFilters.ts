import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Filters, Query } from '@/lib/filters';
import { FILTER_KEYS, filtersFromQuery, filtersToQuery } from '@/lib/filters';

/** Global filters live in the URL query, so every view is shareable and survives refresh. */
export function useFilters() {
  const route = useRoute();
  const router = useRouter();

  const filters = computed<Filters>(() => filtersFromQuery(route.query as Query));
  const filterQuery = computed(() => filtersToQuery(filters.value));

  function otherParams(): Record<string, string> {
    const rest: Record<string, string> = {};
    for (const [k, v] of Object.entries(route.query)) {
      if ((FILTER_KEYS as readonly string[]).includes(k)) continue;
      if (typeof v === 'string') rest[k] = v;
    }
    return rest;
  }

  function setFilters(patch: Partial<Filters>): void {
    const next = { ...filters.value, ...patch };
    void router.replace({ query: { ...otherParams(), ...filtersToQuery(next) } });
  }

  function resetFilters(): void {
    void router.replace({ query: otherParams() });
  }

  return { filters, filterQuery, setFilters, resetFilters };
}
