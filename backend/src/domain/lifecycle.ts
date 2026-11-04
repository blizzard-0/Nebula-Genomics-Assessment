import type {
  KitDto,
  KitState,
  MilestoneType,
  OrderDto,
  Position,
  StageKey,
  StuckInfo,
} from '../contracts.js';
import type { CleanEvent, CleanOrder } from './clean.js';
import {
  CLOSED_STATUSES,
  CRITICAL_FACTOR,
  EVENT_TYPE_INDEX,
  EVENT_TYPES,
  MILESTONE_STEPS,
  REPLACEMENT_OWNER,
  REPLACEMENT_TARGET_DAYS,
  STAGES,
  UPLOAD_ONLY_PRODUCT,
} from './pipeline.js';
import type { IssueCode, QualityLog } from './quality.js';
import { daysBetween } from './time.js';

const idx = (type: string): number => EVENT_TYPE_INDEX.get(type) ?? -1;
const QC_PASSED = idx('qc_passed');
const QC_FAILED = idx('qc_failed');
const REPORT_READY = idx('report_ready');
const KIT_REPLACED = idx('kit_replaced');

const STUCK_REASON: Record<StageKey, string> = {
  fulfillment: 'Kit not shipped',
  outbound: 'Shipped, no delivery scan',
  customer: 'Delivered, customer has not mailed the sample',
  return: 'Sample mailed, not received at the lab',
  qc: 'Received at the lab, no QC result',
  sequencing: 'QC passed, sequencing not complete',
  report: 'Sequenced, report not ready',
};

const MISSING_CODE: Record<number, IssueCode> = {
  0: 'missing_kit_shipped',
  1: 'missing_kit_delivered',
  2: 'missing_sample_mailed',
  3: 'missing_sample_received',
  4: 'missing_qc_result',
  5: 'missing_sequencing_complete',
};

const round = (n: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Internal kit facts before they are turned into the DTO. */
interface KitFacts {
  dto: KitDto;
  /** Time of each pipeline step (null = not scanned). */
  steps: (number | null)[];
  /** Highest step index observed, -1 if none. */
  reached: number;
  replacedAt: number | null;
  lastEventAt: number;
}

export interface LifecycleResult {
  orders: OrderDto[];
  kits: KitDto[];
}

export function deriveLifecycle(
  orders: Map<string, CleanOrder>,
  events: CleanEvent[],
  asOf: number,
  log: QualityLog,
): LifecycleResult {
  // Group counted events by order, then kit.
  const byOrder = new Map<string, Map<string, CleanEvent[]>>();
  for (const e of events) {
    if (!e.counted) continue;
    let kits = byOrder.get(e.orderId);
    if (!kits) byOrder.set(e.orderId, (kits = new Map<string, CleanEvent[]>()));
    let list = kits.get(e.kitId);
    if (!list) kits.set(e.kitId, (list = []));
    list.push(e);
  }

  const orderDtos: OrderDto[] = [];
  const kitDtos: KitDto[] = [];

  for (const order of orders.values()) {
    const kitEvents = byOrder.get(order.id) ?? new Map<string, CleanEvent[]>();
    const kits = buildKits(order, kitEvents, log);
    kitDtos.push(...kits.map((k) => k.dto));
    orderDtos.push(buildOrder(order, kits, asOf, log));
  }

  orderDtos.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { orders: orderDtos, kits: kitDtos };
}

function buildKits(
  order: CleanOrder,
  kitEvents: Map<string, CleanEvent[]>,
  log: QualityLog,
): KitFacts[] {
  const groups = [...kitEvents.entries()].map(([kitId, list]) => ({
    kitId,
    list,
    first: Math.min(...list.map((e) => e.at)),
  }));
  groups.sort((a, b) => a.first - b.first || a.kitId.localeCompare(b.kitId));

  const closed = CLOSED_STATUSES.has(order.status);
  const facts: KitFacts[] = [];
  groups.forEach(({ kitId, list }, i) => {
    const prev = facts[i - 1];
    let startMs = order.createdAt;
    if (prev) startMs = prev.replacedAt ?? prev.lastEventAt;

    const milestones: (number | null)[] = EVENT_TYPES.map(() => null);
    for (const e of list) {
      const current = milestones[e.typeIndex];
      if (current === null || current === undefined || e.at < current)
        milestones[e.typeIndex] = e.at;
    }

    const qcPassed = milestones[QC_PASSED] ?? null;
    const qcFailed = milestones[QC_FAILED] ?? null;
    const steps: (number | null)[] = MILESTONE_STEPS.map((types) => {
      if (types.length > 1) return qcPassed ?? qcFailed;
      return milestones[idx(types[0] ?? '')] ?? null;
    });
    let reached = -1;
    steps.forEach((t, s) => {
      if (t !== null) reached = s;
    });

    const flags: string[] = [];
    const inferred: MilestoneType[] = [];
    for (let s = 0; s < reached; s++) {
      if (steps[s] !== null) continue;
      // A later step happened, so this one did too; it just was not scanned.
      const type: MilestoneType =
        s === 4 ? 'qc_passed' : (MILESTONE_STEPS[s]?.[0] ?? 'kit_shipped');
      inferred.push(type);
      const code = MISSING_CODE[s];
      if (code) log.add(code, kitId);
    }

    // Monotonic check across observed steps.
    let last = -Infinity;
    let outOfOrder = false;
    for (const t of steps) {
      if (t === null) continue;
      if (t < last) outOfOrder = true;
      last = Math.max(last, t);
    }
    if (startMs > (steps.find((t) => t !== null) ?? Infinity)) outOfOrder = true;
    if (outOfOrder) {
      flags.push('out_of_order');
      log.add('out_of_order', kitId);
    }

    const durations = STAGES.map((stage, s) => {
      let start: number | null;
      if (s === 0) start = startMs;
      else if (stage.key === 'sequencing') start = qcPassed;
      else start = steps[s - 1] ?? null;
      const end = steps[s] ?? null;
      if (start === null || end === null) return null;
      const d = daysBetween(start, end);
      return d < 0 ? null : round(d);
    });

    const replacedAt = milestones[KIT_REPLACED] ?? null;
    const hasReport = milestones[REPORT_READY] !== null;
    let state: KitState;
    if (hasReport) state = 'completed';
    else if (replacedAt !== null) state = 'replaced';
    else if (closed) state = 'closed';
    else if (qcFailed !== null && qcPassed === null) state = 'qc_failed';
    else state = 'in_progress';

    let stage: StageKey | null = null;
    if (state === 'in_progress' || state === 'closed') {
      stage = qcFailed !== null && qcPassed === null ? null : (STAGES[reached + 1]?.key ?? null);
    }

    const dto: KitDto = {
      id: kitId,
      orderId: order.id,
      startMs,
      milestones,
      inferred,
      state,
      stage,
      durations,
      flags,
      events: [],
    };
    if (prev) {
      if (prev.replacedAt === null) {
        prev.dto.flags.push('implicit_replacement');
        if (prev.dto.state !== 'completed') prev.dto.state = 'replaced';
        prev.dto.stage = null;
        log.add('implicit_replacements', prev.dto.id);
      }
    }
    facts.push({
      dto,
      steps,
      reached,
      replacedAt,
      lastEventAt: Math.max(...list.map((e) => e.at)),
    });
  });
  return facts;
}

function buildOrder(order: CleanOrder, kits: KitFacts[], asOf: number, log: QualityLog): OrderDto {
  const flags: string[] = [];
  if (order.createdKind === 'naive') flags.push('naive_timezone');

  const uploadOnly = order.product === UPLOAD_ONLY_PRODUCT;
  if (uploadOnly && kits.length > 0) {
    flags.push('upload_only_with_kits');
    log.add('upload_only_with_kits', order.id);
  } else if (uploadOnly) {
    log.add('upload_only', order.id);
  }
  if (order.isTest) log.add('test_orders', order.id);

  const closed = CLOSED_STATUSES.has(order.status);
  if (closed && kits.length > 0) log.add('closed_with_kits', `${order.id} (${order.status})`);

  const latest = kits[kits.length - 1];
  const reportAt = latest?.dto.milestones[REPORT_READY] ?? null;

  let position: Position;
  let since = order.createdAt;
  let kitId: string | null = null;
  if (uploadOnly && !latest) position = 'upload_only';
  else if (latest && latest.dto.state === 'completed') position = 'completed';
  else if (closed) position = 'closed';
  else if (!latest) position = 'fulfillment';
  else if (latest.dto.state === 'replaced') {
    // Replacement issued, new kit not shipped yet.
    position = 'fulfillment';
    since = latest.replacedAt ?? latest.lastEventAt;
    kitId = latest.dto.id;
  } else if (latest.dto.state === 'qc_failed') {
    position = 'qc_failed';
    since = latest.dto.milestones[QC_FAILED] ?? latest.lastEventAt;
    kitId = latest.dto.id;
  } else {
    position = latest.dto.stage ?? 'fulfillment';
    since = latest.reached >= 0 ? (latest.steps[latest.reached] ?? latest.lastEventAt) : since;
    kitId = latest.dto.id;
  }

  let stuck: StuckInfo | null = null;
  if (
    !order.isTest &&
    position !== 'completed' &&
    position !== 'closed' &&
    position !== 'upload_only'
  ) {
    const daysWaiting = Math.max(0, daysBetween(since, asOf));
    let target: number;
    let stage: StuckInfo['stage'];
    let owner: StuckInfo['owner'];
    let reason: string;
    if (position === 'qc_failed') {
      target = REPLACEMENT_TARGET_DAYS;
      stage = 'replacement';
      owner = REPLACEMENT_OWNER;
      reason = 'QC failed, replacement not issued';
    } else {
      const def = STAGES.find((s) => s.key === position) ?? STAGES[0];
      target = def?.targetDays ?? 0;
      stage = position;
      owner = def?.owner ?? 'Fulfillment';
      reason =
        position === 'fulfillment' && kitId
          ? 'Replacement kit not shipped'
          : STUCK_REASON[position];
    }
    if (daysWaiting > target) {
      stuck = {
        stage,
        owner,
        reason,
        kitId,
        sinceMs: since,
        daysWaiting: round(daysWaiting, 2),
        targetDays: target,
        overdueDays: round(daysWaiting - target, 2),
        severity: daysWaiting > target * CRITICAL_FACTOR ? 'critical' : 'overdue',
      };
    }
  }

  const completedAt = position === 'completed' ? reportAt : null;
  return {
    id: order.id,
    createdAt: order.createdAt,
    customerId: order.customerId,
    product: order.product,
    country: order.country,
    status: order.status,
    isTest: order.isTest,
    kitIds: kits.map((k) => k.dto.id),
    position,
    stuck,
    e2eDays: completedAt !== null ? round(daysBetween(order.createdAt, completedAt)) : null,
    flags,
  };
}
