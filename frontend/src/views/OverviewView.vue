<script setup lang="ts">
import { Info } from 'lucide-vue-next';
import { computed } from 'vue';
import PipelineTrack from '@/components/PipelineTrack.vue';
import SeverityBadge from '@/components/SeverityBadge.vue';
import StateBlock from '@/components/StateBlock.vue';
import WeeklyVolumeChart from '@/components/WeeklyVolumeChart.vue';
import { useFilteredData } from '@/composables/useFilteredData';
import { useFilters } from '@/composables/useFilters';
import { fmtDate, fmtDays, fmtInt, fmtNum1, fmtPct } from '@/lib/format';
import {
  computeKpis,
  countByOwner,
  OWNERS,
  positionBuckets,
  sortStuck,
  stuckRows,
  weeklyVolume,
} from '@/lib/metrics';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const { orders, kits } = useFilteredData();
const { filterQuery, resetFilters } = useFilters();

const ds = computed(() => store.dataset);
const kpis = computed(() => (ds.value ? computeKpis(ds.value, orders.value, kits.value) : null));
const buckets = computed(() => positionBuckets(orders.value));
const volume = computed(() => weeklyVolume(orders.value, store.index?.products ?? []));
const rows = computed(() => stuckRows(orders.value));
const byOwner = computed(() => countByOwner(rows.value));
const criticalByOwner = computed(() =>
  countByOwner(rows.value.filter((r) => r.stuck.severity === 'critical')),
);
const worst = computed(() => sortStuck(rows.value, 'overdueDays', 'desc').slice(0, 5));

const handledIssues = computed(() => ds.value?.quality.filter((q) => q.level !== 'info') ?? []);

const tiles = computed(() => {
  const k = kpis.value;
  if (!k) return [];
  return [
    { label: 'Orders', value: fmtInt(k.orders), note: `${fmtInt(k.uploadOnly)} upload only` },
    { label: 'Kit orders', value: fmtInt(k.kitOrders), note: `${fmtInt(k.closed)} closed` },
    { label: 'In flight', value: fmtInt(k.inProgress), note: 'Kit somewhere in the pipeline' },
    {
      label: 'Reports delivered',
      value: fmtInt(k.completed),
      note: `${fmtPct(k.kitOrders ? k.completed / k.kitOrders : null)} of kit orders`,
    },
    {
      label: 'Stuck',
      value: fmtInt(k.stuck),
      note: `${fmtInt(k.critical)} critical`,
      tone: k.critical > 0 ? 'bad' : k.stuck > 0 ? 'warn' : 'ok',
      to: { path: '/stuck', query: filterQuery.value },
    },
    {
      label: 'Median order to report',
      value: k.medianE2eDays === null ? '–' : `${fmtNum1(k.medianE2eDays)} d`,
      note: 'Completed orders, across replacements',
    },
    {
      label: 'QC fail rate',
      value: fmtPct(k.qcFailRate),
      note: `of ${fmtInt(k.qcResults)} QC results`,
    },
    {
      label: 'Replacement rate',
      value: fmtPct(k.replacementRate),
      note: 'Kit orders needing a new kit',
    },
  ];
});

const TONE_TEXT: Record<string, string> = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok' };
</script>

<template>
  <div v-if="ds && kpis" class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 class="text-xl font-semibold">Pipeline overview</h1>
        <p class="text-sm text-muted">
          Positions and waiting times as of {{ fmtDate(ds.meta.asOf) }} (UTC). Filters apply to the
          order date.
        </p>
      </div>
    </div>

    <RouterLink
      v-if="handledIssues.length"
      to="/data"
      class="flex items-start gap-2.5 rounded-lg border border-info/20 bg-info-soft px-4 py-2.5 text-sm text-info no-underline hover:border-info/40"
    >
      <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        The export has {{ handledIssues.length }} kinds of data problems (duplicate events, missing
        scans, orphan events and more). They are handled before any number here is computed.
        <span class="font-medium underline underline-offset-2">Review the data decisions</span>
      </span>
    </RouterLink>

    <StateBlock
      v-if="orders.length === 0"
      kind="empty"
      title="No orders match these filters"
      message="Widen the date range or clear a product, country or status filter."
    >
      <button type="button" class="btn" @click="resetFilters()">Clear filters</button>
    </StateBlock>

    <template v-else>
      <dl
        class="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-4"
      >
        <component
          :is="tile.to ? 'RouterLink' : 'div'"
          v-for="tile in tiles"
          :key="tile.label"
          :to="tile.to"
          class="flex flex-col-reverse justify-end gap-1 bg-surface px-4 py-3.5 no-underline"
          :class="tile.to ? 'hover:bg-paper' : ''"
        >
          <span class="text-xs text-muted">{{ tile.note }}</span>
          <dd
            class="text-2xl leading-tight font-semibold tabular-nums"
            :class="tile.tone ? TONE_TEXT[tile.tone] : ''"
          >
            {{ tile.value }}
          </dd>
          <dt class="text-sm text-ink-soft">{{ tile.label }}</dt>
        </component>
      </dl>

      <PipelineTrack :buckets="buckets" :stages="ds.stages" />

      <div class="grid gap-5 lg:grid-cols-3">
        <section class="panel min-w-0 p-4 sm:p-5 lg:col-span-2" aria-labelledby="volume-title">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="volume-title" class="panel-title">Orders per week</h2>
            <p class="panel-note">By order date (UTC weeks starting Monday)</p>
          </div>
          <WeeklyVolumeChart class="mt-3" :volume="volume" />
          <p v-if="volume.hidden" class="panel-note mt-2">
            {{ fmtInt(volume.hidden) }} older
            {{ volume.hidden === 1 ? 'order is' : 'orders are' }} outside this two-year window.
            Check their order dates.
          </p>
        </section>

        <section class="panel flex min-w-0 flex-col p-4 sm:p-5" aria-labelledby="followup-title">
          <h2 id="followup-title" class="panel-title">Who needs to act</h2>
          <p class="panel-note">Stuck orders by the team that can unblock them</p>
          <ul class="mt-3 divide-y divide-line">
            <li v-for="owner in OWNERS" :key="owner">
              <RouterLink
                :to="{ path: '/stuck', query: { ...filterQuery, owner } }"
                class="-mx-2 flex items-center justify-between rounded px-2 py-2 text-sm no-underline hover:bg-paper"
              >
                <span>{{ owner }}</span>
                <span class="flex items-baseline gap-2 tabular-nums">
                  <span v-if="criticalByOwner[owner]" class="text-xs text-bad">
                    {{ fmtInt(criticalByOwner[owner]) }} critical
                  </span>
                  <span class="w-10 text-right font-semibold">{{ fmtInt(byOwner[owner]) }}</span>
                </span>
              </RouterLink>
            </li>
          </ul>
          <h3 class="mt-4 text-xs font-medium text-muted">Most overdue</h3>
          <ul class="mt-1.5 flex flex-col gap-1.5">
            <li v-for="r in worst" :key="r.order.id">
              <RouterLink
                :to="`/orders/${r.order.id}`"
                class="-mx-2 flex items-center gap-2 rounded px-2 py-1 text-sm no-underline hover:bg-paper"
              >
                <span class="id">{{ r.order.id }}</span>
                <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ r.stuck.reason }}</span>
                <span class="text-xs whitespace-nowrap tabular-nums">
                  +{{ fmtDays(r.stuck.overdueDays) }}
                </span>
                <SeverityBadge :severity="r.stuck.severity" class="hidden sm:inline-flex" />
              </RouterLink>
            </li>
            <li v-if="worst.length === 0" class="text-sm text-ok">Nothing is overdue.</li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
