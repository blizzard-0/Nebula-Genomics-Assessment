<script setup lang="ts">
import type { QualityIssue } from '@contracts';
import { computed } from 'vue';
import Badge from '@/components/Badge.vue';
import DatasetList from '@/components/DatasetList.vue';
import type { BadgeTone } from '@/components/Badge.vue';
import StateBlock from '@/components/StateBlock.vue';
import UploadPanel from '@/components/UploadPanel.vue';
import { fmtDateTime, fmtInt } from '@/lib/format';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const ds = computed(() => store.dataset);

const AS_OF_SOURCE = {
  export_date: 'export date given in the brief',
  latest_timestamp: 'latest timestamp in the files',
  override: 'set by you',
} as const;

const LEVEL: Record<QualityIssue['level'], { label: string; tone: BadgeTone }> = {
  error: { label: 'Needs a look', tone: 'bad' },
  warning: { label: 'Handled', tone: 'warn' },
  info: { label: 'Expected', tone: 'info' },
};

const RULES = [
  {
    term: 'Days waiting',
    text: 'Time from the last recorded milestone to the as-of instant, never to today, so the numbers match the export.',
  },
  {
    term: 'Stuck',
    text: 'An active order whose current stage has taken longer than its target. Critical means more than twice the target.',
  },
  {
    term: 'Failed QC',
    text: 'If no replacement kit is issued within 3 days of a failed QC, the order is stuck with Fulfillment.',
  },
  {
    term: 'Not shipped',
    text: 'A paid kit order with no kit shipped after 3 days is stuck with Fulfillment, as is a replacement that has not shipped.',
  },
  {
    term: 'Replacements',
    text: 'The order follows its newest kit. A replacement kit is timed from the kit_replaced event, not the order date. End-to-end time spans all kits.',
  },
  {
    term: 'Closed orders',
    text: 'Cancelled and refunded orders are counted in volume and their real transitions count toward turnaround, but they are never stuck.',
  },
];
</script>

<template>
  <div class="flex flex-col gap-5">
    <div>
      <h1 class="text-xl font-semibold">Data</h1>
      <p class="max-w-3xl text-sm text-muted">
        Switch between datasets or add your own, see how the open export was cleaned, and the rules
        behind every number.
      </p>
    </div>

    <DatasetList />

    <div class="grid gap-5 lg:grid-cols-5">
      <section
        v-if="ds"
        class="panel min-w-0 p-4 sm:p-5 lg:col-span-2"
        aria-labelledby="current-title"
      >
        <h2 id="current-title" class="panel-title">Showing now</h2>
        <p class="mt-0.5 text-sm">{{ store.activeEntry?.name ?? ds.meta.label }}</p>
        <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div class="col-span-2">
            <dt class="text-xs text-muted">As of</dt>
            <dd>
              {{ fmtDateTime(ds.meta.asOf) }}
              <span class="text-muted">({{ AS_OF_SOURCE[ds.meta.asOfSource] }})</span>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Order rows</dt>
            <dd class="tabular-nums">{{ fmtInt(ds.meta.counts.orderRows) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Event rows</dt>
            <dd class="tabular-nums">{{ fmtInt(ds.meta.counts.eventRows) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Orders kept</dt>
            <dd class="tabular-nums">{{ fmtInt(ds.meta.counts.orders) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Kits</dt>
            <dd class="tabular-nums">{{ fmtInt(ds.meta.counts.kits) }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-xs text-muted">Events counted</dt>
            <dd class="tabular-nums">
              {{ fmtInt(ds.meta.counts.events) }}
              <span class="text-muted">
                of {{ fmtInt(ds.meta.counts.eventRows) }} rows, after duplicates and orphans
              </span>
            </dd>
          </div>
        </dl>
      </section>
      <StateBlock
        v-else-if="store.status === 'loading'"
        kind="loading"
        title="Loading the data"
        class="panel lg:col-span-2"
      />
      <StateBlock
        v-else
        kind="error"
        title="No dataset loaded"
        :message="store.error ?? 'Upload two files to start.'"
        class="panel lg:col-span-2"
      />

      <UploadPanel class="min-w-0 lg:col-span-3" />
    </div>

    <section v-if="ds" class="panel overflow-hidden" aria-labelledby="quality-title">
      <div class="px-4 pt-4 pb-3 sm:px-5">
        <h2 id="quality-title" class="panel-title">Data quality report</h2>
        <p class="panel-note">
          Every problem found in the open dataset, how often, and what was done about it.
        </p>
      </div>
      <ul class="divide-y divide-line border-t border-line" data-testid="quality-list">
        <li
          v-for="issue in ds.quality"
          :key="issue.code"
          class="grid gap-x-6 gap-y-1.5 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(14rem,2fr)_5rem_minmax(0,4fr)]"
        >
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium">{{ issue.title }}</p>
            <Badge :tone="LEVEL[issue.level].tone">{{ LEVEL[issue.level].label }}</Badge>
          </div>
          <p class="text-sm font-semibold tabular-nums md:text-right">{{ fmtInt(issue.count) }}</p>
          <div class="text-sm">
            <p class="text-ink-soft">{{ issue.decision }}</p>
            <p v-if="issue.examples.length" class="mt-1 text-xs text-muted">
              For example
              <span v-for="(ex, i) in issue.examples" :key="ex">
                <span class="id text-ink-soft">{{ ex }}</span
                ><template v-if="i < issue.examples.length - 1">, </template>
              </span>
            </p>
          </div>
        </li>
        <li v-if="ds.quality.length === 0" class="px-5 py-4 text-sm text-ok">
          No data problems were found.
        </li>
      </ul>
    </section>

    <div v-if="ds" class="grid gap-5 lg:grid-cols-2">
      <section class="panel min-w-0 overflow-hidden" aria-labelledby="targets-title">
        <h2 id="targets-title" class="panel-title px-4 pt-4 pb-3 sm:px-5">Stage targets</h2>
        <div class="relative overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">From → to</th>
                <th scope="col" class="num">Target</th>
                <th scope="col">Chase</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in ds.stages" :key="s.key">
                <td class="font-medium">{{ s.label }}</td>
                <td class="text-ink-soft">{{ s.from }} → {{ s.to }}</td>
                <td class="num">{{ s.targetDays }} d</td>
                <td>{{ s.owner }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel p-4 sm:p-5" aria-labelledby="rules-title">
        <h2 id="rules-title" class="panel-title">How the numbers are defined</h2>
        <dl class="mt-3 flex flex-col gap-3 text-sm">
          <div v-for="r in RULES" :key="r.term">
            <dt class="font-medium">{{ r.term }}</dt>
            <dd class="text-ink-soft">{{ r.text }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>
