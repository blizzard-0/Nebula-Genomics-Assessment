<script setup lang="ts">
import type { StageDef } from '@contracts';
import { computed } from 'vue';
import { useFilters } from '@/composables/useFilters';
import { fmtInt } from '@/lib/format';
import type { PositionBucket } from '@/lib/metrics';

const props = defineProps<{ buckets: PositionBucket[]; stages: StageDef[] }>();
const { filterQuery } = useFilters();

const inFlight = computed(() =>
  props.buckets.filter((b) => props.stages.some((s) => s.key === b.key)),
);
const qcFailed = computed(() => props.buckets.find((b) => b.key === 'qc_failed'));
const completed = computed(() => props.buckets.find((b) => b.key === 'completed'));
const closed = computed(() => props.buckets.find((b) => b.key === 'closed'));

const max = computed(() => Math.max(1, ...inFlight.value.map((b) => b.count)));
const activeTotal = computed(
  () => inFlight.value.reduce((s, b) => s + b.count, 0) + (qcFailed.value?.count ?? 0),
);

const stageOf = (key: string) => props.stages.find((s) => s.key === key);
const pct = (n: number) => `${Math.max(n > 0 ? 2 : 0, (n / max.value) * 100)}%`;

function stuckLink(stage: string) {
  return { path: '/stuck', query: { ...filterQuery.value, stage } };
}
</script>

<template>
  <section class="panel p-4 sm:p-5" aria-labelledby="track-title">
    <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id="track-title" class="panel-title">Where kits are now</h2>
      <p class="panel-note">
        {{ fmtInt(activeTotal) }} orders in flight. Each order counts once, at its newest kit.
      </p>
    </div>

    <div class="mt-4 flex gap-4 overflow-x-auto pb-1">
      <ol class="grid min-w-[46rem] flex-1 grid-cols-7" aria-label="Orders in flight by stage">
        <li v-for="(b, i) in inFlight" :key="b.key" class="flex min-w-0 flex-col">
          <p class="px-2 text-2xl leading-none font-semibold tabular-nums">{{ fmtInt(b.count) }}</p>
          <div class="mt-2 flex h-24 items-end px-2" aria-hidden="true">
            <div
              class="flex w-full flex-col-reverse overflow-hidden rounded-t-sm bg-accent/15"
              :style="{ height: pct(b.count) }"
            >
              <div
                class="bg-bad"
                :style="{ height: `${(b.critical / Math.max(1, b.count)) * 100}%` }"
              />
              <div
                class="bg-warn/80"
                :style="{ height: `${((b.stuck - b.critical) / Math.max(1, b.count)) * 100}%` }"
              />
            </div>
          </div>
          <!-- The flow line: one node per stage. -->
          <div class="relative flex h-5 items-center" aria-hidden="true">
            <div
              class="absolute right-0 h-0.5 bg-accent/30"
              :class="i === 0 ? 'left-2' : 'left-0'"
            />
            <div class="relative ml-2 size-2.5 rounded-full border-2 border-accent bg-surface" />
          </div>
          <p class="px-2 text-sm leading-snug font-medium">{{ b.label }}</p>
          <p class="px-2 text-xs text-muted">
            {{ stageOf(b.key)?.owner }}, {{ stageOf(b.key)?.targetDays }}-day target
          </p>
          <RouterLink
            v-if="b.stuck > 0"
            :to="stuckLink(b.key)"
            class="mx-2 mt-1.5 self-start rounded text-xs font-medium underline-offset-2 hover:underline"
            :class="b.critical > 0 ? 'text-bad' : 'text-warn'"
          >
            {{ fmtInt(b.stuck) }} stuck<span v-if="b.critical"
              >, {{ fmtInt(b.critical) }} critical</span
            >
          </RouterLink>
          <p v-else class="mx-2 mt-1.5 text-xs text-ok">On track</p>
        </li>
      </ol>

      <div class="flex shrink-0 flex-col gap-2 border-l border-line pl-4">
        <RouterLink
          v-if="qcFailed"
          :to="stuckLink('replacement')"
          class="rounded-lg px-3 py-2 no-underline hover:bg-paper"
        >
          <p class="text-xl leading-none font-semibold tabular-nums">
            {{ fmtInt(qcFailed.count) }}
          </p>
          <p class="mt-1 text-xs text-muted">QC failed, awaiting replacement</p>
          <p v-if="qcFailed.stuck" class="mt-1 text-xs font-medium text-bad">
            {{ fmtInt(qcFailed.stuck) }} past 3 days
          </p>
        </RouterLink>
        <div v-if="completed" class="rounded-lg bg-ok-soft px-3 py-2">
          <p class="text-xl leading-none font-semibold text-ok tabular-nums">
            {{ fmtInt(completed.count) }}
          </p>
          <p class="mt-1 text-xs text-ok">Report ready</p>
        </div>
        <div v-if="closed" class="px-3 py-2">
          <p class="text-xl leading-none font-semibold text-ink-soft tabular-nums">
            {{ fmtInt(closed.count) }}
          </p>
          <p class="mt-1 text-xs text-muted">Closed (cancelled or refunded)</p>
        </div>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
      <span class="flex items-center gap-1.5"
        ><i class="size-2.5 rounded-sm bg-accent/15" /> In stage, within target</span
      >
      <span class="flex items-center gap-1.5"
        ><i class="size-2.5 rounded-sm bg-warn/80" /> Overdue</span
      >
      <span class="flex items-center gap-1.5"
        ><i class="size-2.5 rounded-sm bg-bad" /> Critical (over 2× target)</span
      >
    </div>
  </section>
</template>
