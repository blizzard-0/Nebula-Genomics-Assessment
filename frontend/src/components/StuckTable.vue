<script setup lang="ts">
import type { Dataset } from '@contracts';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import SeverityBadge from '@/components/SeverityBadge.vue';
import { fmtDate, fmtInt, fmtNum1, productLabel } from '@/lib/format';
import type { StuckRow, StuckSortKey } from '@/lib/metrics';
import { sortStuck, stuckStageLabel } from '@/lib/metrics';

const props = withDefaults(
  defineProps<{ rows: StuckRow[]; dataset: Dataset; pageSize?: number }>(),
  { pageSize: 50 },
);

const router = useRouter();
const sortKey = ref<StuckSortKey>('overdueDays');
const sortDir = ref<'asc' | 'desc'>('desc');
const page = ref(0);

const sorted = computed(() => sortStuck(props.rows, sortKey.value, sortDir.value));
const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / props.pageSize)));
const visible = computed(() =>
  sorted.value.slice(page.value * props.pageSize, (page.value + 1) * props.pageSize),
);

watch(
  () => props.rows,
  () => {
    page.value = 0;
  },
);

const COLUMNS: { key: StuckSortKey; label: string; num?: boolean; hide?: string }[] = [
  { key: 'orderId', label: 'Order' },
  { key: 'product', label: 'Product', hide: 'hidden md:table-cell' },
  { key: 'country', label: 'Country', hide: 'hidden lg:table-cell' },
  { key: 'stage', label: 'Waiting for' },
  { key: 'owner', label: 'Owner' },
  { key: 'sinceMs', label: 'Since', hide: 'hidden lg:table-cell' },
  { key: 'daysWaiting', label: 'Days waiting', num: true },
  { key: 'targetDays', label: 'Target', num: true, hide: 'hidden md:table-cell' },
  { key: 'overdueDays', label: 'Overdue by', num: true },
  { key: 'severity', label: 'Severity' },
];

function sortBy(key: StuckSortKey): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    const numeric = ['sinceMs', 'daysWaiting', 'targetDays', 'overdueDays', 'severity'];
    sortDir.value = numeric.includes(key) && key !== 'sinceMs' ? 'desc' : 'asc';
  }
  page.value = 0;
}

function ariaSort(key: StuckSortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) return 'none';
  return sortDir.value === 'asc' ? 'ascending' : 'descending';
}

function open(row: StuckRow): void {
  void router.push({ name: 'order', params: { id: row.order.id } });
}
</script>

<template>
  <div>
    <div class="relative overflow-x-auto">
      <table class="data-table" data-testid="stuck-table">
        <thead>
          <tr>
            <th
              v-for="col in COLUMNS"
              :key="col.key"
              scope="col"
              :class="[col.num ? 'num' : '', col.hide]"
              :aria-sort="ariaSort(col.key)"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1 hover:text-ink"
                :class="sortKey === col.key ? 'text-ink' : ''"
                :data-sort="col.key"
                @click="sortBy(col.key)"
              >
                {{ col.label }}
                <ArrowUp
                  v-if="sortKey === col.key && sortDir === 'asc'"
                  class="size-3.5"
                  aria-hidden="true"
                />
                <ArrowDown v-else-if="sortKey === col.key" class="size-3.5" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in visible"
            :key="r.order.id"
            class="cursor-pointer hover:bg-paper"
            data-testid="stuck-row"
            @click="open(r)"
          >
            <td>
              <RouterLink :to="`/orders/${r.order.id}`" class="id text-accent" @click.stop>
                {{ r.order.id }}
              </RouterLink>
              <span v-if="r.stuck.kitId" class="id block text-muted">{{ r.stuck.kitId }}</span>
            </td>
            <td class="hidden md:table-cell">{{ productLabel(r.order.product) }}</td>
            <td class="hidden lg:table-cell">{{ r.order.country }}</td>
            <td class="min-w-48">
              <span class="block">{{ r.stuck.reason }}</span>
              <span class="text-xs text-muted">{{ stuckStageLabel(dataset, r.stuck.stage) }}</span>
            </td>
            <td>{{ r.stuck.owner }}</td>
            <td class="hidden whitespace-nowrap lg:table-cell">{{ fmtDate(r.stuck.sinceMs) }}</td>
            <td class="num">{{ fmtNum1(r.stuck.daysWaiting) }}</td>
            <td class="num hidden md:table-cell">{{ r.stuck.targetDays }}</td>
            <td
              class="num font-medium"
              :class="r.stuck.severity === 'critical' ? 'text-bad' : 'text-warn'"
            >
              +{{ fmtNum1(r.stuck.overdueDays) }}
            </td>
            <td><SeverityBadge :severity="r.stuck.severity" /></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      v-if="pageCount > 1"
      class="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm"
    >
      <span class="text-muted">
        {{ fmtInt(page * pageSize + 1) }}–{{
          fmtInt(Math.min((page + 1) * pageSize, rows.length))
        }}
        of {{ fmtInt(rows.length) }}
      </span>
      <div class="flex gap-1">
        <button type="button" class="btn px-2" :disabled="page === 0" @click="page--">
          <ChevronLeft class="size-4" aria-hidden="true" /><span class="sr-only"
            >Previous page</span
          >
        </button>
        <button type="button" class="btn px-2" :disabled="page >= pageCount - 1" @click="page++">
          <ChevronRight class="size-4" aria-hidden="true" /><span class="sr-only">Next page</span>
        </button>
      </div>
    </div>
  </div>
</template>
