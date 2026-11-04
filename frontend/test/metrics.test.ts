import { describe, expect, it } from 'vitest';
import { indexDataset, searchIds } from '@/lib/dataset';
import {
  computeKpis,
  countByOwner,
  healthOf,
  kitsForOrders,
  positionBuckets,
  sortStuck,
  stageStats,
  stuckRows,
  weeklyVolume,
  weekStart,
} from '@/lib/metrics';
import { EVENT_TYPES, makeDataset, makeKit, makeOrder, makeStuck } from './fixtures';

const qc = (type: 'qc_passed' | 'qc_failed') =>
  EVENT_TYPES.map((t) => (t === type ? Date.parse('2026-09-10T00:00:00Z') : null));

const durations = (fulfillment: number, outbound: number | null = null) => [
  fulfillment,
  outbound,
  null,
  null,
  null,
  null,
  null,
];

const kits = [
  makeKit('k1', 'o1', {
    state: 'completed',
    durations: durations(1, 4),
    milestones: qc('qc_passed'),
  }),
  makeKit('k2', 'o2', { state: 'replaced', durations: durations(2), milestones: qc('qc_failed') }),
  makeKit('k3', 'o2', { durations: durations(5) }),
  makeKit('k4', 'o3', { durations: durations(10) }),
];

const orders = [
  makeOrder('o1', { kitIds: ['k1'], position: 'completed', e2eDays: 40 }),
  makeOrder('o2', {
    kitIds: ['k2', 'k3'],
    product: 'wgs_100x',
    position: 'customer',
    stuck: makeStuck({ owner: 'Customer', severity: 'critical', overdueDays: 50 }),
  }),
  makeOrder('o3', {
    kitIds: ['k4'],
    position: 'outbound',
    stuck: makeStuck({ owner: 'Carrier', stage: 'outbound', overdueDays: 2, daysWaiting: 9 }),
  }),
  makeOrder('o4', { product: 'upload_only', position: 'upload_only' }),
  makeOrder('o5', { position: 'closed', status: 'cancelled' }),
];

const ds = makeDataset(orders, kits);
const index = indexDataset(ds);
const productOf = (k: (typeof kits)[number]) => index.ordersById.get(k.orderId)?.product ?? '';

describe('computeKpis', () => {
  it('summarizes volume, progress and quality', () => {
    const k = computeKpis(ds, orders, kitsForOrders(index, orders));
    expect(k).toMatchObject({
      orders: 5,
      kitOrders: 4,
      uploadOnly: 1,
      inProgress: 2,
      completed: 1,
      closed: 1,
      stuck: 2,
      critical: 1,
      medianE2eDays: 40,
      qcResults: 2,
      qcFailRate: 0.5,
    });
    // o1 and o2 have kits; o2 needed a replacement.
    expect(k.replacementRate).toBeCloseTo(1 / 3);
  });
});

describe('positionBuckets', () => {
  it('counts orders and stuck orders per position in pipeline order', () => {
    const buckets = positionBuckets(orders);
    expect(buckets.map((b) => b.key)).toEqual([
      'fulfillment',
      'outbound',
      'customer',
      'return',
      'qc',
      'sequencing',
      'report',
      'qc_failed',
      'completed',
      'closed',
    ]);
    expect(buckets.find((b) => b.key === 'customer')).toMatchObject({
      count: 1,
      stuck: 1,
      critical: 1,
    });
    expect(buckets.find((b) => b.key === 'outbound')).toMatchObject({
      count: 1,
      stuck: 1,
      critical: 0,
    });
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(4);
  });
});

describe('stageStats', () => {
  it('aggregates durations overall and by product', () => {
    const stats = stageStats(ds, kits, productOf, ['wgs_30x', 'wgs_100x']);
    const fulfillment = stats[0];
    expect(fulfillment).toMatchObject({ key: 'fulfillment', n: 4, median: 3.5, withinTarget: 0.5 });
    expect(fulfillment?.byProduct.wgs_30x).toMatchObject({ n: 2, median: 5.5 });
    expect(fulfillment?.byProduct.wgs_100x).toMatchObject({ n: 2, median: 3.5 });
    expect(stats[1]).toMatchObject({ n: 1, median: 4, withinTarget: 1 });
    expect(stats[2]).toMatchObject({ n: 0, median: null, withinTarget: null });
  });

  it('grades the share within target', () => {
    expect(healthOf(0.95)).toBe('ok');
    expect(healthOf(0.8)).toBe('warn');
    expect(healthOf(0.5)).toBe('bad');
    expect(healthOf(null)).toBe('none');
  });
});

describe('stuck list', () => {
  const rows = stuckRows(orders);

  it('lists stuck orders and owner counts that add up to the total', () => {
    expect(rows.map((r) => r.order.id)).toEqual(['o2', 'o3']);
    const byOwner = countByOwner(rows);
    expect(byOwner).toEqual({ Fulfillment: 0, Carrier: 1, Customer: 1, Lab: 0 });
    expect(Object.values(byOwner).reduce((a, b) => a + b, 0)).toBe(rows.length);
  });

  it('sorts by any column in both directions', () => {
    expect(sortStuck(rows, 'overdueDays', 'desc').map((r) => r.order.id)).toEqual(['o2', 'o3']);
    expect(sortStuck(rows, 'overdueDays', 'asc').map((r) => r.order.id)).toEqual(['o3', 'o2']);
    expect(sortStuck(rows, 'owner', 'asc').map((r) => r.stuck.owner)).toEqual([
      'Carrier',
      'Customer',
    ]);
  });
});

describe('weeklyVolume', () => {
  it('buckets orders into UTC weeks starting Monday, stacked by product', () => {
    expect(new Date(weekStart(Date.parse('2026-09-03T12:00:00Z'))).toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
    const v = weeklyVolume(
      [
        makeOrder('a', { createdAt: Date.parse('2026-09-01T00:00:00Z') }),
        makeOrder('b', { createdAt: Date.parse('2026-09-02T00:00:00Z'), product: 'wgs_100x' }),
        makeOrder('c', { createdAt: Date.parse('2026-09-15T00:00:00Z') }),
      ],
      ['wgs_30x', 'wgs_100x', 'upload_only'],
    );
    expect(v.weeks).toHaveLength(3);
    expect(v.series).toEqual([
      { product: 'wgs_30x', counts: [1, 0, 1] },
      { product: 'wgs_100x', counts: [1, 0, 0] },
    ]);
  });
});

describe('weeklyVolume cap', () => {
  it('charts at most two years and counts the older orders', () => {
    const v = weeklyVolume(
      [
        makeOrder('typo', { createdAt: Date.parse('2016-09-01T00:00:00Z') }),
        makeOrder('a', { createdAt: Date.parse('2026-09-01T00:00:00Z') }),
      ],
      ['wgs_30x'],
    );
    expect(v.weeks).toHaveLength(104);
    expect(v.hidden).toBe(1);
    expect(v.series[0]?.counts.reduce((x, y) => x + y, 0)).toBe(1);
  });
});

describe('searchIds', () => {
  it('finds orders by order, kit and customer id', () => {
    expect(searchIds(ds, index, 'o3')[0]).toMatchObject({ kind: 'order', orderId: 'o3' });
    expect(searchIds(ds, index, 'k3')[0]).toMatchObject({ kind: 'kit', orderId: 'o2' });
    expect(searchIds(ds, index, 'cus_o4')[0]).toMatchObject({ kind: 'customer', orderId: 'o4' });
    expect(searchIds(ds, index, 'x')).toEqual([]);
  });
});
