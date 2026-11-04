<script setup lang="ts">
import type { Dataset, EventType, KitDto, StageDef } from '@contracts';
import { computed } from 'vue';
import Badge from '@/components/Badge.vue';
import type { BadgeTone } from '@/components/Badge.vue';
import { DASH, eventLabel, fmtDateTime, fmtNum1 } from '@/lib/format';

const props = defineProps<{
  dataset: Dataset;
  kit: KitDto;
  seq: number;
  total: number;
  /** Is this the order's current kit? */
  current: boolean;
  closed: boolean;
}>();

type StepStatus = 'done' | 'inferred' | 'waiting' | 'pending' | 'skipped';

interface Step {
  key: string;
  label: string;
  at: number | null;
  status: StepStatus;
  /** Stage that ends at this step. */
  stage: StageDef | null;
  duration: number | null;
  waitingDays: number | null;
  failed?: boolean;
}

const DAY = 86_400_000;
const MILESTONES: EventType[][] = [
  ['kit_shipped'],
  ['kit_delivered'],
  ['sample_mailed'],
  ['sample_received'],
  ['qc_passed', 'qc_failed'],
  ['sequencing_complete'],
  ['report_ready'],
];

const at = (type: EventType) => {
  const i = props.dataset.eventTypes.indexOf(type);
  return i < 0 ? null : (props.kit.milestones[i] ?? null);
};

const steps = computed<Step[]>(() => {
  const k = props.kit;
  const qcFailedAt = at('qc_failed');
  const qcPassedAt = at('qc_passed');
  const times = MILESTONES.map((types) => {
    for (const t of types) {
      const v = at(t);
      if (v !== null) return v;
    }
    return null;
  });
  let reached = -1;
  times.forEach((t, i) => {
    if (t !== null) reached = i;
  });
  const waitingIndex =
    props.current && k.state === 'in_progress' && reached < MILESTONES.length - 1
      ? reached + 1
      : -1;

  const list: Step[] = [
    {
      key: 'start',
      label: props.seq === 1 ? 'Order placed' : 'Replacement issued',
      at: k.startMs,
      status: 'done',
      stage: null,
      duration: null,
      waitingDays: null,
    },
  ];
  MILESTONES.forEach((types, i) => {
    const isQc = types.length > 1;
    const failed = isQc && qcFailedAt !== null && qcPassedAt === null;
    const type: EventType = isQc
      ? failed
        ? 'qc_failed'
        : 'qc_passed'
      : (types[0] ?? 'kit_shipped');
    const inferred = k.inferred.includes(type as never);
    let status: StepStatus;
    if (times[i] !== null) status = 'done';
    else if (inferred) status = 'inferred';
    else if (i === waitingIndex) status = 'waiting';
    else if (k.state === 'in_progress' && props.current) status = 'pending';
    else status = 'skipped';
    const stage = props.dataset.stages[i] ?? null;
    let waitingDays: number | null = null;
    if (status === 'waiting') {
      const since = reached >= 0 ? times[reached] : k.startMs;
      if (since !== null && since !== undefined) {
        waitingDays = (props.dataset.meta.asOf - since) / DAY;
      }
    }
    list.push({
      key: type,
      label: isQc && times[i] === null && !inferred ? 'QC result' : eventLabel(type),
      at: times[i] ?? null,
      status,
      stage,
      duration: k.durations[i] ?? null,
      waitingDays,
      failed,
    });
  });
  // Steps after a failed QC never happen on this kit.
  if (qcFailedAt !== null && qcPassedAt === null) {
    for (const s of list.slice(6)) s.status = 'skipped';
  }
  const replacedAt = at('kit_replaced');
  if (replacedAt !== null) {
    list.push({
      key: 'kit_replaced',
      label: 'Kit replaced',
      at: replacedAt,
      status: 'done',
      stage: null,
      duration: null,
      waitingDays: null,
    });
  }
  return list;
});

function tone(value: number | null, target: number): BadgeTone {
  if (value === null) return 'neutral';
  if (value <= target) return 'ok';
  if (value <= target * 2) return 'warn';
  return 'bad';
}

const STATE: Record<KitDto['state'], { label: string; tone: BadgeTone }> = {
  in_progress: { label: 'In progress', tone: 'accent' },
  completed: { label: 'Report ready', tone: 'ok' },
  replaced: { label: 'Replaced', tone: 'neutral' },
  closed: { label: 'Closed with order', tone: 'neutral' },
  qc_failed: { label: 'QC failed', tone: 'bad' },
};

const DOT: Record<StepStatus, string> = {
  done: 'border-accent bg-accent',
  inferred: 'border-accent border-dashed bg-surface',
  waiting: 'border-warn bg-warn-soft ring-4 ring-warn/15',
  pending: 'border-line-strong bg-surface',
  skipped: 'border-line bg-paper',
};
</script>

<template>
  <article class="panel p-4 sm:p-5" :aria-label="`Kit ${seq} of ${total}, ${kit.id}`">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h3 class="text-sm font-semibold">Kit {{ seq }} of {{ total }}</h3>
      <span class="id text-ink-soft">{{ kit.id }}</span>
      <Badge :tone="STATE[kit.state].tone">{{ STATE[kit.state].label }}</Badge>
      <Badge v-if="kit.flags.includes('out_of_order')" tone="warn">Timestamps out of order</Badge>
      <Badge v-if="closed && kit.state === 'closed'" tone="neutral">Order closed</Badge>
    </header>

    <ol class="mt-4">
      <li
        v-for="(step, i) in steps"
        :key="step.key"
        class="relative grid grid-cols-[1.25rem_1fr] gap-x-3 pb-4 last:pb-0"
        :data-status="step.status"
      >
        <!-- Rail between this step and the next. -->
        <span
          v-if="i < steps.length - 1"
          class="absolute top-4 bottom-0 left-2.25 w-0.5"
          :class="
            steps[i + 1]?.status === 'done'
              ? 'bg-accent/40'
              : steps[i + 1]?.status === 'inferred'
                ? 'border-l-2 border-dashed border-accent/40'
                : 'bg-line'
          "
          aria-hidden="true"
        />
        <span
          class="relative z-10 mt-1 size-3.5 justify-self-center rounded-full border-2"
          :class="[
            DOT[step.status],
            step.failed && step.status === 'done' ? 'border-bad! bg-bad!' : '',
          ]"
          aria-hidden="true"
        />
        <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div class="min-w-0">
            <p
              class="text-sm font-medium"
              :class="{
                'text-muted': step.status === 'pending' || step.status === 'skipped',
                'text-bad': step.failed && step.status === 'done',
              }"
            >
              {{ step.label }}
            </p>
            <p class="text-xs text-muted">
              <template v-if="step.status === 'done'">{{ fmtDateTime(step.at) }}</template>
              <template v-else-if="step.status === 'inferred'">
                No scan. Inferred, because a later step was recorded.
              </template>
              <template v-else-if="step.status === 'waiting'">
                Waiting {{ fmtNum1(step.waitingDays) }} days so far
              </template>
              <template v-else-if="step.status === 'pending'">Not reached yet</template>
              <template v-else>{{ DASH }}</template>
            </p>
          </div>
          <div
            v-if="step.stage && step.status !== 'skipped' && step.status !== 'pending'"
            class="flex items-center gap-2 text-xs"
          >
            <span class="text-muted">{{ step.stage.label }}</span>
            <Badge v-if="step.duration !== null" :tone="tone(step.duration, step.stage.targetDays)">
              {{ fmtNum1(step.duration) }} d of {{ step.stage.targetDays }}
            </Badge>
            <Badge
              v-else-if="step.status === 'waiting'"
              :tone="tone(step.waitingDays, step.stage.targetDays)"
            >
              {{ fmtNum1(step.waitingDays) }} d of {{ step.stage.targetDays }}
            </Badge>
            <Badge v-else-if="step.status === 'done' || step.status === 'inferred'" tone="neutral">
              not measurable
            </Badge>
          </div>
        </div>
      </li>
    </ol>
  </article>
</template>
