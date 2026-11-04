import type { Dataset, KitDto, OrderDto, Owner, Position, StageDef, StuckInfo } from '@contracts';
import type { DatasetIndex } from './dataset';
import { median, p90, ratio } from './stats';

export const PIPELINE_POSITIONS: readonly Position[] = [
  'fulfillment',
  'outbound',
  'customer',
  'return',
  'qc',
  'sequencing',
  'report',
  'qc_failed',
];

export const POSITION_LABEL: Record<Position, string> = {
  fulfillment: 'Awaiting shipment',
  outbound: 'Shipping to customer',
  customer: 'With customer',
  return: 'Returning to lab',
  qc: 'In QC',
  sequencing: 'Sequencing',
  report: 'Report pending',
  qc_failed: 'QC failed, needs replacement',
  completed: 'Report ready',
  closed: 'Closed',
  upload_only: 'Upload only',
};

export const OWNERS: readonly Owner[] = ['Fulfillment', 'Carrier', 'Customer', 'Lab'];

export const isActive = (o: OrderDto): boolean => PIPELINE_POSITIONS.includes(o.position);
export const isKitOrder = (o: OrderDto): boolean => o.position !== 'upload_only';

export function kitsForOrders(index: DatasetIndex, orders: readonly OrderDto[]): KitDto[] {
  const kits: KitDto[] = [];
  for (const o of orders) {
    for (const id of o.kitIds) {
      const k = index.kitsById.get(id);
      if (k) kits.push(k);
    }
  }
  return kits;
}

export interface Kpis {
  orders: number;
  kitOrders: number;
  uploadOnly: number;
  inProgress: number;
  completed: number;
  closed: number;
  stuck: number;
  critical: number;
  medianE2eDays: number | null;
  qcFailRate: number | null;
  qcResults: number;
  replacementRate: number | null;
}

export function computeKpis(
  ds: Dataset,
  orders: readonly OrderDto[],
  kits: readonly KitDto[],
): Kpis {
  const passed = ds.eventTypes.indexOf('qc_passed');
  const failed = ds.eventTypes.indexOf('qc_failed');
  let qcResults = 0;
  let qcFailed = 0;
  for (const k of kits) {
    const f = k.milestones[failed] ?? null;
    const p = k.milestones[passed] ?? null;
    if (f !== null || p !== null || k.inferred.includes('qc_passed')) qcResults++;
    if (f !== null && p === null) qcFailed++;
  }
  const kitOrders = orders.filter(isKitOrder);
  const withKits = kitOrders.filter((o) => o.kitIds.length > 0);
  const e2e = orders.flatMap((o) => (o.e2eDays === null ? [] : [o.e2eDays]));
  const stuck = orders.filter((o) => o.stuck);
  return {
    orders: orders.length,
    kitOrders: kitOrders.length,
    uploadOnly: orders.length - kitOrders.length,
    inProgress: orders.filter(isActive).length,
    completed: orders.filter((o) => o.position === 'completed').length,
    closed: orders.filter((o) => o.position === 'closed').length,
    stuck: stuck.length,
    critical: stuck.filter((o) => o.stuck?.severity === 'critical').length,
    medianE2eDays: median(e2e),
    qcFailRate: ratio(qcFailed, qcResults),
    qcResults,
    replacementRate: ratio(withKits.filter((o) => o.kitIds.length > 1).length, withKits.length),
  };
}

export interface PositionBucket {
  key: Position;
  label: string;
  count: number;
  stuck: number;
  critical: number;
}

/** Where each order's current kit is now, in pipeline order, plus finished and closed. */
export function positionBuckets(orders: readonly OrderDto[]): PositionBucket[] {
  const keys: Position[] = [...PIPELINE_POSITIONS, 'completed', 'closed'];
  const buckets = new Map<Position, PositionBucket>(
    keys.map((key) => [key, { key, label: POSITION_LABEL[key], count: 0, stuck: 0, critical: 0 }]),
  );
  for (const o of orders) {
    const b = buckets.get(o.position);
    if (!b) continue;
    b.count++;
    if (o.stuck) {
      b.stuck++;
      if (o.stuck.severity === 'critical') b.critical++;
    }
  }
  return keys.map((k) => buckets.get(k) as PositionBucket);
}

const WEEK = 7 * 86_400_000;

/** Monday 00:00 UTC of the week containing `ms`. */
export function weekStart(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

export interface WeeklySeries {
  weeks: number[];
  series: { product: string; counts: number[] }[];
  /** Orders older than the charted window (only when the data spans more than MAX_WEEKS). */
  hidden: number;
}

/** The weekly chart shows at most two years, so one mistyped date cannot flatten it. */
export const MAX_WEEKS = 104;

export function weeklyVolume(
  orders: readonly OrderDto[],
  products: readonly string[],
): WeeklySeries {
  if (orders.length === 0) return { weeks: [], series: [], hidden: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const o of orders) {
    min = Math.min(min, o.createdAt);
    max = Math.max(max, o.createdAt);
  }
  const last = weekStart(max);
  const first = Math.max(weekStart(min), last - (MAX_WEEKS - 1) * WEEK);
  const weeks: number[] = [];
  for (let w = first; w <= last; w += WEEK) weeks.push(w);
  const pos = new Map(weeks.map((w, i) => [w, i]));
  const present = products.filter((p) => orders.some((o) => o.product === p));
  const series = present.map((product) => ({ product, counts: weeks.map(() => 0) }));
  const byProduct = new Map(series.map((s) => [s.product, s]));
  for (const o of orders) {
    const s = byProduct.get(o.product);
    const i = pos.get(weekStart(o.createdAt));
    if (s && i !== undefined) s.counts[i] = (s.counts[i] ?? 0) + 1;
  }
  const hidden = orders.filter((o) => o.createdAt < first).length;
  return { weeks, series, hidden };
}

export interface DurationSummary {
  n: number;
  median: number | null;
  p90: number | null;
  withinTarget: number | null;
}

export interface StageStat extends StageDef, DurationSummary {
  byProduct: Record<string, DurationSummary>;
}

export function summarize(values: readonly number[], targetDays: number): DurationSummary {
  return {
    n: values.length,
    median: median(values),
    p90: p90(values),
    withinTarget: ratio(values.filter((v) => v <= targetDays).length, values.length),
  };
}

/** Measured durations of one stage, optionally for one product only. */
export function stageValues(
  kits: readonly KitDto[],
  stageIndex: number,
  productOf: (kit: KitDto) => string,
  product?: string,
): number[] {
  const values: number[] = [];
  for (const k of kits) {
    if (product && productOf(k) !== product) continue;
    const d = k.durations[stageIndex];
    if (d !== null && d !== undefined) values.push(d);
  }
  return values;
}

export function stageStats(
  ds: Dataset,
  kits: readonly KitDto[],
  productOf: (kit: KitDto) => string,
  products: readonly string[],
): StageStat[] {
  return ds.stages.map((stage, i) => {
    const all = stageValues(kits, i, productOf);
    const byProduct: Record<string, DurationSummary> = {};
    for (const p of products) {
      byProduct[p] = summarize(stageValues(kits, i, productOf, p), stage.targetDays);
    }
    return { ...stage, ...summarize(all, stage.targetDays), byProduct };
  });
}

export type Health = 'ok' | 'warn' | 'bad' | 'none';

/** Share of kits within target: ≥ 90 % on track, ≥ 75 % watch, else behind. */
export function healthOf(withinTarget: number | null): Health {
  if (withinTarget === null) return 'none';
  if (withinTarget >= 0.9) return 'ok';
  if (withinTarget >= 0.75) return 'warn';
  return 'bad';
}

/** Median against target: under target on track, up to 1.5× watch, beyond behind. */
export function medianHealth(value: number | null, target: number): Health {
  if (value === null) return 'none';
  if (value <= target) return 'ok';
  if (value <= target * 1.5) return 'warn';
  return 'bad';
}

export interface StuckRow {
  order: OrderDto;
  stuck: StuckInfo;
}

export type StuckSortKey =
  | 'orderId'
  | 'product'
  | 'country'
  | 'stage'
  | 'owner'
  | 'sinceMs'
  | 'daysWaiting'
  | 'targetDays'
  | 'overdueDays'
  | 'severity';

export function stuckRows(orders: readonly OrderDto[]): StuckRow[] {
  return orders.flatMap((order) => (order.stuck ? [{ order, stuck: order.stuck }] : []));
}

function sortValue(r: StuckRow, key: StuckSortKey): string | number {
  switch (key) {
    case 'orderId':
      return r.order.id;
    case 'product':
      return r.order.product;
    case 'country':
      return r.order.country;
    case 'severity':
      return r.stuck.severity === 'critical' ? 1 : 0;
    default:
      return r.stuck[key];
  }
}

export function sortStuck(
  rows: readonly StuckRow[],
  key: StuckSortKey,
  dir: 'asc' | 'desc',
): StuckRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb));
    return (
      cmp * sign ||
      b.stuck.overdueDays - a.stuck.overdueDays ||
      a.order.id.localeCompare(b.order.id)
    );
  });
}

export function countByOwner(rows: readonly StuckRow[]): Record<Owner, number> {
  const counts: Record<Owner, number> = { Fulfillment: 0, Carrier: 0, Customer: 0, Lab: 0 };
  for (const r of rows) counts[r.stuck.owner]++;
  return counts;
}

export function stuckStageLabel(ds: Dataset, stage: StuckInfo['stage']): string {
  if (stage === 'replacement') return 'Replacement';
  return ds.stages.find((s) => s.key === stage)?.label ?? stage;
}
