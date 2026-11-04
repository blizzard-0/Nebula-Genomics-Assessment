<script setup lang="ts">
import type { Owner, StuckInfo } from '@contracts';
import { Download, LoaderCircle } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StateBlock from '@/components/StateBlock.vue';
import StuckTable from '@/components/StuckTable.vue';
import { useFilteredData } from '@/composables/useFilteredData';
import { downloadText, toCsv } from '@/lib/csv';
import { nextFrame, track } from '@/lib/loading';
import { fmtDate, fmtInt, isoDate } from '@/lib/format';
import { countByOwner, OWNERS, sortStuck, stuckRows, stuckStageLabel } from '@/lib/metrics';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const route = useRoute();
const router = useRouter();
const { orders } = useFilteredData();

const ds = computed(() => store.dataset);

const owner = computed<Owner | ''>(() => {
  const q = String(route.query.owner ?? '');
  return (OWNERS as readonly string[]).includes(q) ? (q as Owner) : '';
});
const stage = computed(() => String(route.query.stage ?? ''));
const severity = computed(() => {
  const q = String(route.query.sev ?? '');
  return q === 'critical' || q === 'overdue' ? q : '';
});

function setParam(key: 'owner' | 'stage' | 'sev', value: string): void {
  const query = { ...route.query };
  if (value) query[key] = value;
  else delete query[key];
  void router.replace({ query });
}

const allRows = computed(() => stuckRows(orders.value));
// Stage and severity narrow the list first; the owner chips then split what is left,
// so the chips always add up to the total shown.
const scoped = computed(() =>
  allRows.value.filter(
    (r) =>
      (!stage.value || r.stuck.stage === stage.value) &&
      (!severity.value || r.stuck.severity === severity.value),
  ),
);
const rows = computed(() =>
  owner.value ? scoped.value.filter((r) => r.stuck.owner === owner.value) : scoped.value,
);
const byOwner = computed(() => countByOwner(scoped.value));

const stageOptions = computed(() => {
  const keys = new Set<StuckInfo['stage']>(allRows.value.map((r) => r.stuck.stage));
  const ordered: StuckInfo['stage'][] = [
    ...(ds.value?.stages.map((s) => s.key) ?? []),
    'replacement',
  ];
  return ordered
    .filter((k) => keys.has(k) || k === stage.value)
    .map((k) => ({ value: k, label: ds.value ? stuckStageLabel(ds.value, k) : k }));
});

const exporting = ref(false);

async function exportCsv(): Promise<void> {
  if (!ds.value || exporting.value) return;
  exporting.value = true;
  try {
    // Let the button and the progress bar paint before the file is built.
    await track(async () => {
      await nextFrame();
      buildAndDownload();
    });
  } finally {
    exporting.value = false;
  }
}

function buildAndDownload(): void {
  if (!ds.value) return;
  const header = [
    'order_id',
    'kit_id',
    'customer_id',
    'product',
    'country',
    'order_status',
    'stage',
    'reason',
    'owner',
    'waiting_since_utc',
    'days_waiting',
    'target_days',
    'overdue_days',
    'severity',
  ];
  const body = sortStuck(rows.value, 'overdueDays', 'desc').map((r) => [
    r.order.id,
    r.stuck.kitId ?? '',
    r.order.customerId,
    r.order.product,
    r.order.country,
    r.order.status,
    r.stuck.stage,
    r.stuck.reason,
    r.stuck.owner,
    new Date(r.stuck.sinceMs).toISOString(),
    r.stuck.daysWaiting,
    r.stuck.targetDays,
    r.stuck.overdueDays,
    r.stuck.severity,
  ]);
  const suffix = owner.value ? `-${owner.value.toLowerCase()}` : '';
  downloadText(`stuck-kits${suffix}-${isoDate(ds.value.meta.asOf)}.csv`, toCsv([header, ...body]));
}
</script>

<template>
  <div v-if="ds" class="flex flex-col gap-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Stuck kits</h1>
        <p class="max-w-3xl text-sm text-muted">
          Active orders whose current step has taken longer than its target, measured to
          {{ fmtDate(ds.meta.asOf) }}. Critical means more than twice the target. Cancelled,
          refunded and test orders are never listed.
        </p>
      </div>
      <button
        type="button"
        class="btn"
        :disabled="rows.length === 0 || exporting"
        data-testid="export-csv"
        @click="exportCsv"
      >
        <LoaderCircle v-if="exporting" class="size-4 animate-spin" aria-hidden="true" />
        <Download v-else class="size-4" aria-hidden="true" />
        {{ exporting ? 'Preparing…' : `Export CSV (${fmtInt(rows.length)})` }}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Owner">
      <button
        type="button"
        class="rounded-full border px-3 py-1 text-sm transition-colors"
        :class="
          owner === ''
            ? 'border-accent bg-accent text-white'
            : 'border-line-strong bg-surface hover:bg-paper'
        "
        :aria-pressed="owner === ''"
        @click="setParam('owner', '')"
      >
        All owners <span class="ml-1 font-semibold tabular-nums">{{ fmtInt(scoped.length) }}</span>
      </button>
      <button
        v-for="o in OWNERS"
        :key="o"
        type="button"
        class="rounded-full border px-3 py-1 text-sm transition-colors"
        :class="
          owner === o
            ? 'border-accent bg-accent text-white'
            : 'border-line-strong bg-surface hover:bg-paper'
        "
        :aria-pressed="owner === o"
        :data-owner="o"
        @click="setParam('owner', owner === o ? '' : o)"
      >
        {{ o }} <span class="ml-1 font-semibold tabular-nums">{{ fmtInt(byOwner[o]) }}</span>
      </button>

      <div class="flex flex-wrap gap-2 sm:ml-auto">
        <label class="sr-only" for="stuck-stage">Stage</label>
        <select
          id="stuck-stage"
          class="field py-1"
          :value="stage"
          @change="setParam('stage', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">All stages</option>
          <option v-for="s in stageOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
        <label class="sr-only" for="stuck-sev">Severity</label>
        <select
          id="stuck-sev"
          class="field py-1"
          :value="severity"
          @change="setParam('sev', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Any severity</option>
          <option value="critical">Critical only</option>
          <option value="overdue">Overdue only</option>
        </select>
      </div>
    </div>

    <section class="panel overflow-hidden" aria-label="Stuck orders">
      <StuckTable v-if="rows.length" :rows="rows" :dataset="ds" />
      <StateBlock
        v-else-if="allRows.length === 0"
        kind="empty"
        title="Nothing is stuck"
        message="Every active order in this selection is within its stage target."
      />
      <StateBlock
        v-else
        kind="empty"
        title="No stuck orders match"
        message="Try another owner, stage or severity."
      >
        <button
          type="button"
          class="btn"
          @click="
            router.replace({
              query: { ...route.query, owner: undefined, stage: undefined, sev: undefined },
            })
          "
        >
          Show all stuck orders
        </button>
      </StateBlock>
    </section>
  </div>
</template>
