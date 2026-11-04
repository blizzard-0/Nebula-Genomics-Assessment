<script setup lang="ts">
import type { StageKey } from '@contracts';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DurationHistogram from '@/components/DurationHistogram.vue';
import StageMedianChart from '@/components/StageMedianChart.vue';
import StateBlock from '@/components/StateBlock.vue';
import { useFilteredData } from '@/composables/useFilteredData';
import { fmtInt, fmtNum1, fmtPct, productLabel } from '@/lib/format';
import type { Health } from '@/lib/metrics';
import { healthOf, medianHealth, stageStats, stageValues } from '@/lib/metrics';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const route = useRoute();
const router = useRouter();
const { kits, productOf } = useFilteredData();

const ds = computed(() => store.dataset);

const products = computed(() => {
  const present = new Set(kits.value.map(productOf));
  return (store.index?.products ?? []).filter((p) => present.has(p));
});

const stats = computed(() =>
  ds.value ? stageStats(ds.value, kits.value, productOf, products.value) : [],
);

const selectedStage = computed<StageKey>(() => {
  const q = String(route.query.hist ?? '');
  return (ds.value?.stages.find((s) => s.key === q)?.key ?? 'fulfillment') as StageKey;
});
const histProduct = ref<string>('');

function selectStage(key: StageKey): void {
  void router.replace({ query: { ...route.query, hist: key } });
}

const selected = computed(() => stats.value.find((s) => s.key === selectedStage.value));
const histValues = computed(() => {
  const i = ds.value?.stages.findIndex((s) => s.key === selectedStage.value) ?? -1;
  return i < 0 ? [] : stageValues(kits.value, i, productOf, histProduct.value || undefined);
});

const HEALTH_TEXT: Record<Health, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  none: 'text-muted',
};
const HEALTH_BAR: Record<Health, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  none: 'bg-line',
};
const HEALTH_LABEL: Record<Health, string> = {
  ok: 'on track',
  warn: 'watch',
  bad: 'behind',
  none: 'no data',
};
</script>

<template>
  <div v-if="ds" class="flex flex-col gap-5">
    <div>
      <h1 class="text-xl font-semibold">Stage turnaround</h1>
      <p class="max-w-3xl text-sm text-muted">
        Calendar days each stage took, for transitions that actually happened. A stage is only
        measured when both of its milestones were scanned; replacement kits are timed from the
        replacement, not from the order.
      </p>
    </div>

    <StateBlock
      v-if="kits.length === 0"
      kind="empty"
      title="No kits match these filters"
      message="Upload-only orders have no kits. Widen the filters to see turnaround."
    />

    <template v-else>
      <section class="panel overflow-hidden" aria-labelledby="stage-table-title">
        <div class="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-3 sm:px-5">
          <h2 id="stage-table-title" class="panel-title">Per stage</h2>
          <p class="panel-note">
            Within target: share of kits at or under the target. Green ≥ 90 %, amber ≥ 75 %.
          </p>
        </div>
        <div class="relative overflow-x-auto">
          <table class="data-table min-w-[52rem]">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col" class="num">Target</th>
                <th scope="col" class="num">Kits</th>
                <th scope="col" class="num">Median</th>
                <th scope="col" class="num">P90</th>
                <th scope="col">Within target</th>
                <th v-for="p in products" :key="p" scope="col" class="num">
                  {{ productLabel(p) }} median
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in stats"
                :key="s.key"
                class="cursor-pointer hover:bg-paper"
                :class="s.key === selectedStage ? 'bg-accent-soft/50' : ''"
                @click="selectStage(s.key)"
              >
                <th scope="row" class="!bg-transparent text-left !text-sm !font-normal">
                  <button
                    type="button"
                    class="text-left font-medium text-ink"
                    :aria-pressed="s.key === selectedStage"
                    @click.stop="selectStage(s.key)"
                  >
                    {{ s.label }}
                  </button>
                  <span class="block text-xs whitespace-normal text-muted">
                    {{ s.from }} → {{ s.to }}
                  </span>
                </th>
                <td class="num">{{ s.targetDays }} d</td>
                <td class="num">{{ fmtInt(s.n) }}</td>
                <td
                  class="num font-medium"
                  :class="HEALTH_TEXT[medianHealth(s.median, s.targetDays)]"
                >
                  {{ fmtNum1(s.median) }}
                </td>
                <td class="num" :class="HEALTH_TEXT[medianHealth(s.p90, s.targetDays)]">
                  {{ fmtNum1(s.p90) }}
                </td>
                <td>
                  <div class="flex items-center gap-2">
                    <div
                      class="h-1.5 w-20 overflow-hidden rounded-full bg-paper"
                      aria-hidden="true"
                    >
                      <div
                        class="h-full rounded-full"
                        :class="HEALTH_BAR[healthOf(s.withinTarget)]"
                        :style="{ width: `${(s.withinTarget ?? 0) * 100}%` }"
                      />
                    </div>
                    <span
                      class="text-sm tabular-nums"
                      :class="HEALTH_TEXT[healthOf(s.withinTarget)]"
                    >
                      {{ fmtPct(s.withinTarget) }}
                    </span>
                    <span class="sr-only">{{ HEALTH_LABEL[healthOf(s.withinTarget)] }}</span>
                  </div>
                </td>
                <td
                  v-for="p in products"
                  :key="p"
                  class="num"
                  :class="HEALTH_TEXT[medianHealth(s.byProduct[p]?.median ?? null, s.targetDays)]"
                >
                  {{ fmtNum1(s.byProduct[p]?.median) }}
                  <span class="text-xs text-muted">({{ fmtInt(s.byProduct[p]?.n) }})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
          Medians in days. Colors compare to the target: green at or under, amber up to 1.5×, red
          beyond. Select a stage to see its distribution.
        </p>
      </section>

      <div class="grid gap-5 lg:grid-cols-2">
        <section class="panel min-w-0 p-4 sm:p-5" aria-labelledby="by-product-title">
          <h2 id="by-product-title" class="panel-title">Median by product</h2>
          <p class="panel-note">The dark tick on each row is the stage target.</p>
          <StageMedianChart class="mt-3" :stats="stats" :products="products" />
        </section>

        <section v-if="selected" class="panel min-w-0 p-4 sm:p-5" aria-labelledby="hist-title">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="hist-title" class="panel-title">{{ selected.label }} distribution</h2>
              <p class="panel-note">
                {{ fmtInt(histValues.length) }} kits. Target {{ selected.targetDays }} days; amber
                is over target, red over twice the target.
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <label class="sr-only" for="hist-stage">Stage</label>
              <select
                id="hist-stage"
                class="field py-1"
                :value="selectedStage"
                @change="selectStage(($event.target as HTMLSelectElement).value as StageKey)"
              >
                <option v-for="s in ds.stages" :key="s.key" :value="s.key">{{ s.label }}</option>
              </select>
              <label class="sr-only" for="hist-product">Product</label>
              <select id="hist-product" v-model="histProduct" class="field py-1">
                <option value="">All products</option>
                <option v-for="p in products" :key="p" :value="p">{{ productLabel(p) }}</option>
              </select>
            </div>
          </div>
          <DurationHistogram
            v-if="histValues.length"
            class="mt-3"
            :values="histValues"
            :target-days="selected.targetDays"
            :label="selected.label"
          />
          <StateBlock
            v-else
            kind="empty"
            title="No measured durations"
            message="No kit has both milestones of this stage for the current filters."
          />
        </section>
      </div>
    </template>
  </div>
</template>
