<script setup lang="ts">
import { EVENT_FLAG } from '@contracts';
import { ArrowLeft, ChevronRight } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Badge from '@/components/Badge.vue';
import KitTimeline from '@/components/KitTimeline.vue';
import SeverityBadge from '@/components/SeverityBadge.vue';
import StateBlock from '@/components/StateBlock.vue';
import { kitsOfOrder } from '@/lib/dataset';
import { eventLabel, fmtDate, fmtDateTime, fmtNum1, productLabel, statusLabel } from '@/lib/format';
import { POSITION_LABEL, stuckStageLabel } from '@/lib/metrics';
import { useDatasetStore } from '@/stores/dataset';

const props = defineProps<{ id: string }>();
const store = useDatasetStore();
const router = useRouter();

const ds = computed(() => store.dataset);
const order = computed(() => store.index?.ordersById.get(props.id) ?? null);
const kits = computed(() =>
  order.value && store.index ? kitsOfOrder(store.index, order.value) : [],
);
const closed = computed(
  () => order.value?.status === 'cancelled' || order.value?.status === 'refunded',
);

const events = computed(() => {
  const d = ds.value;
  if (!d) return [];
  return kits.value
    .flatMap((k) =>
      k.events.map(([id, typeIndex, at, sourceIndex, raw, flags]) => ({
        id,
        kitId: k.id,
        type: d.eventTypes[typeIndex] ?? 'unknown',
        at,
        source: d.sources[sourceIndex] ?? '',
        raw,
        flags,
      })),
    )
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
});

const flaggedCount = computed(() => events.value.filter((e) => e.flags !== 0).length);

function flagNotes(flags: number): { label: string; tone: 'warn' | 'info' | 'neutral' }[] {
  const notes: { label: string; tone: 'warn' | 'info' | 'neutral' }[] = [];
  if (flags & EVENT_FLAG.duplicate)
    notes.push({ label: 'Duplicate, not counted', tone: 'neutral' });
  if (flags & EVENT_FLAG.conflict) notes.push({ label: 'Later copy, ignored', tone: 'warn' });
  if (flags & EVENT_FLAG.naiveTimezone)
    notes.push({ label: 'No time zone, read as UTC', tone: 'info' });
  return notes;
}

function back(): void {
  if (window.history.state?.back) router.back();
  else void router.push('/stuck');
}

const positionTone = computed(() => {
  const o = order.value;
  if (!o) return 'neutral' as const;
  if (o.stuck) return o.stuck.severity === 'critical' ? ('bad' as const) : ('warn' as const);
  if (o.position === 'completed') return 'ok' as const;
  if (o.position === 'closed' || o.position === 'upload_only') return 'neutral' as const;
  return 'accent' as const;
});
</script>

<template>
  <div v-if="ds" class="flex flex-col gap-5">
    <button
      type="button"
      class="flex items-center gap-1 self-start text-sm text-muted hover:text-ink"
      @click="back"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> Back
    </button>

    <StateBlock
      v-if="!order"
      kind="empty"
      :title="`Order ${id} is not in this dataset`"
      message="Check the id, or search for an order, kit or customer id at the top of the page."
    >
      <RouterLink to="/stuck" class="btn">Go to stuck kits</RouterLink>
    </StateBlock>

    <template v-else>
      <section class="panel p-4 sm:p-5" aria-labelledby="order-title">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 id="order-title" class="id text-xl !text-[1.35rem] font-semibold">{{ order.id }}</h1>
          <Badge :tone="positionTone">{{ POSITION_LABEL[order.position] }}</Badge>
          <Badge v-if="order.isTest" tone="info">Test order</Badge>
          <Badge v-if="order.status !== 'paid'" tone="neutral">{{
            statusLabel(order.status)
          }}</Badge>
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt class="text-xs text-muted">Placed</dt>
            <dd>{{ fmtDateTime(order.createdAt) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Product</dt>
            <dd>{{ productLabel(order.product) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Country</dt>
            <dd>{{ order.country || '–' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Customer</dt>
            <dd class="id">{{ order.customerId || '–' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Status</dt>
            <dd>{{ statusLabel(order.status) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">Order to report</dt>
            <dd>
              {{ order.e2eDays === null ? 'Not finished' : `${fmtNum1(order.e2eDays)} days` }}
            </dd>
          </div>
        </dl>

        <div
          v-if="order.stuck"
          class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-4 py-3 text-sm"
          :class="order.stuck.severity === 'critical' ? 'bg-bad-soft' : 'bg-warn-soft'"
          role="status"
        >
          <SeverityBadge :severity="order.stuck.severity" />
          <span class="font-medium">{{ order.stuck.reason }}</span>
          <span>
            Waiting {{ fmtNum1(order.stuck.daysWaiting) }} days since
            {{ fmtDate(order.stuck.sinceMs) }}; target {{ order.stuck.targetDays }} days ({{
              stuckStageLabel(ds, order.stuck.stage)
            }}).
          </span>
          <span
            >Follow up with <strong>{{ order.stuck.owner }}</strong
            >.</span
          >
        </div>
        <p v-else-if="order.position === 'upload_only'" class="mt-4 text-sm text-muted">
          Upload-only orders use data the customer already has, so no kit is shipped.
        </p>
        <p v-else-if="order.position === 'closed'" class="mt-4 text-sm text-muted">
          This order was {{ order.status }}, so nothing more is expected and it is never flagged as
          stuck.
        </p>
      </section>

      <section v-if="kits.length" aria-labelledby="kits-title" class="flex flex-col gap-3">
        <h2 id="kits-title" class="text-base font-semibold">
          {{ kits.length === 1 ? 'Kit' : `${kits.length} kits, in replacement order` }}
        </h2>
        <div
          class="grid gap-4"
          :class="kits.length > 1 ? 'lg:grid-cols-2 xl:grid-cols-3' : 'max-w-2xl'"
        >
          <KitTimeline
            v-for="(k, i) in kits"
            :key="k.id"
            :dataset="ds"
            :kit="k"
            :seq="i + 1"
            :total="kits.length"
            :current="i === kits.length - 1"
            :closed="closed"
          />
        </div>
      </section>
      <StateBlock
        v-else-if="order.position !== 'upload_only'"
        kind="empty"
        title="No kit events yet"
        message="The order has not shipped a kit as of the export date."
      />

      <details v-if="events.length" class="panel group overflow-hidden">
        <summary
          class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium sm:px-5"
        >
          <ChevronRight
            class="size-4 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          Raw events ({{ events.length }})
          <span v-if="flaggedCount" class="font-normal text-muted"
            >, {{ flaggedCount }} flagged</span
          >
        </summary>
        <div class="relative overflow-x-auto border-t border-line">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Time (UTC)</th>
                <th scope="col">Event</th>
                <th scope="col">Kit</th>
                <th scope="col">Source</th>
                <th scope="col">As exported</th>
                <th scope="col">Event id</th>
                <th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="e in events"
                :key="e.id"
                :class="e.flags & 1 || e.flags & 4 ? 'text-muted' : ''"
              >
                <td class="whitespace-nowrap">{{ fmtDateTime(e.at) }}</td>
                <td class="whitespace-nowrap">{{ eventLabel(e.type) }}</td>
                <td class="id">{{ e.kitId }}</td>
                <td>{{ e.source }}</td>
                <td class="id whitespace-nowrap">{{ e.raw ?? 'same' }}</td>
                <td class="id">{{ e.id }}</td>
                <td>
                  <span class="flex flex-wrap gap-1">
                    <Badge v-for="n in flagNotes(e.flags)" :key="n.label" :tone="n.tone">{{
                      n.label
                    }}</Badge>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </div>
</template>
