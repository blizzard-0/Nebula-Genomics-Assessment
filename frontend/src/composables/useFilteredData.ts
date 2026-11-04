import type { KitDto } from '@contracts';
import { computed } from 'vue';
import { applyFilters } from '@/lib/filters';
import { kitsForOrders } from '@/lib/metrics';
import { useDatasetStore } from '@/stores/dataset';
import { useFilters } from './useFilters';

/** The orders and kits that match the global filters. */
export function useFilteredData() {
  const store = useDatasetStore();
  const { filters } = useFilters();

  const orders = computed(() => {
    const ds = store.dataset;
    return ds ? applyFilters(ds.orders, filters.value, ds.meta.asOf) : [];
  });

  const kits = computed(() => (store.index ? kitsForOrders(store.index, orders.value) : []));

  const productOf = (kit: KitDto): string =>
    store.index?.ordersById.get(kit.orderId)?.product ?? 'unknown';

  return { orders, kits, productOf, filters };
}
