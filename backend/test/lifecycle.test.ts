import { describe, expect, it } from 'vitest';
import { EVENT_FLAG } from '../src/contracts.js';
import type { EventInput } from './helpers.js';
import { analyzeFiles, robustLatest } from '../src/domain/buildDataset.js';
import {
  build,
  duration,
  eventsCsv,
  fullKit,
  issueCount,
  kit,
  milestone,
  order,
  ordersCsv,
} from './helpers.js';

const AT = (s: string) => Date.parse(s);

describe('cleaning', () => {
  it('counts duplicates once, matched on the instant across time zone formats', () => {
    const ds = build(
      [{ id: 'o1' }],
      [
        ['o1', 'k1', 'kit_shipped', '2026-09-02T12:00:00Z', 'e1'],
        ['o1', 'k1', 'kit_shipped', '2026-09-02T08:00:00-04:00', 'e2'],
        ['o1', 'k1', 'kit_shipped', '2026-09-02 12:00:00', 'e3'],
      ],
    );
    const k = kit(ds, 'k1');
    expect(milestone(ds, k, 'kit_shipped')).toBe(AT('2026-09-02T12:00:00Z'));
    expect(k.events).toHaveLength(3);
    const dupes = k.events.filter((e) => e[5] & EVENT_FLAG.duplicate);
    expect(dupes.map((e) => e[0]).sort()).toEqual(['e2', 'e3']);
    expect(issueCount(ds, 'duplicate_events')).toBe(1);
    expect(ds.meta.counts.events).toBe(1);
  });

  it('keeps the earliest instant when the same step is reported twice', () => {
    const ds = build(
      [{ id: 'o1' }],
      [
        ['o1', 'k1', 'kit_shipped', '2026-09-03T00:00:00Z', 'late'],
        ['o1', 'k1', 'kit_shipped', '2026-09-02T00:00:00Z', 'early'],
      ],
    );
    expect(milestone(ds, kit(ds, 'k1'), 'kit_shipped')).toBe(AT('2026-09-02T00:00:00Z'));
    expect(issueCount(ds, 'conflicting_events')).toBe(1);
  });

  it('excludes orphan events from the pipeline', () => {
    const ds = build(
      [{ id: 'o1' }],
      [
        ['o1', 'k1', 'kit_shipped', '2026-09-02T00:00:00Z'],
        ['ghost', 'k9', 'kit_shipped', '2026-09-02T00:00:00Z'],
      ],
    );
    expect(ds.kits.map((k) => k.id)).toEqual(['k1']);
    expect(issueCount(ds, 'orphan_events')).toBe(1);
  });

  it('drops unreadable rows and unknown event types', () => {
    const ds = build(
      [{ id: 'o1' }, { id: 'o2', created: 'yesterday' }],
      [
        ['o1', 'k1', 'kit_shipped', 'soon'],
        ['o1', 'k1', 'kit_teleported', '2026-09-02T00:00:00Z'],
      ],
    );
    expect(ds.orders.map((o) => o.id)).toEqual(['o1']);
    expect(issueCount(ds, 'invalid_order_rows')).toBe(1);
    expect(issueCount(ds, 'invalid_event_rows')).toBe(1);
    expect(issueCount(ds, 'unknown_event_types')).toBe(1);
  });

  it('excludes events after the as-of date', () => {
    const ds = build(
      [{ id: 'o1' }],
      [
        ['o1', 'k1', 'kit_shipped', '2026-09-02T00:00:00Z'],
        ['o1', 'k1', 'kit_delivered', '2026-09-05T00:00:00Z'],
      ],
      AT('2026-09-03T00:00:00Z'),
    );
    expect(milestone(ds, kit(ds, 'k1'), 'kit_delivered')).toBeNull();
    expect(issueCount(ds, 'events_after_as_of')).toBe(1);
  });
});

describe('milestones and durations', () => {
  it('computes every stage of a complete kit and the end-to-end time', () => {
    const ds = build([{ id: 'o1', created: '2026-09-01T12:00:00Z' }], fullKit('o1', 'k1'));
    const k = kit(ds, 'k1');
    expect(k.state).toBe('completed');
    expect(k.durations).toEqual([1, 2, 3, 3, 2, 10, 2]);
    expect(order(ds, 'o1')).toMatchObject({ position: 'completed', e2eDays: 23, stuck: null });
  });

  it('infers a missing scan and excludes the durations that touch it', () => {
    const events = fullKit('o1', 'k1').filter(([, , type]) => type !== 'kit_delivered');
    const ds = build([{ id: 'o1', created: '2026-09-01T12:00:00Z' }], events);
    const k = kit(ds, 'k1');
    expect(k.inferred).toEqual(['kit_delivered']);
    expect(milestone(ds, k, 'kit_delivered')).toBeNull();
    expect(duration(ds, k, 'outbound')).toBeNull();
    expect(duration(ds, k, 'customer')).toBeNull();
    expect(duration(ds, k, 'return')).toBe(3);
    expect(issueCount(ds, 'missing_kit_delivered')).toBe(1);
  });

  it('flags milestones that go back in time and drops the negative duration', () => {
    const events: EventInput[] = [
      ['o1', 'k1', 'kit_shipped', '2026-09-05T00:00:00Z'],
      ['o1', 'k1', 'kit_delivered', '2026-09-04T00:00:00Z'],
    ];
    const ds = build([{ id: 'o1' }], events);
    const k = kit(ds, 'k1');
    expect(k.flags).toContain('out_of_order');
    expect(duration(ds, k, 'outbound')).toBeNull();
  });
});

describe('replacements', () => {
  const events: EventInput[] = [
    ['o1', 'k1', 'kit_shipped', '2026-09-02T00:00:00Z'],
    ['o1', 'k1', 'kit_delivered', '2026-09-04T00:00:00Z'],
    ['o1', 'k1', 'sample_mailed', '2026-09-06T00:00:00Z'],
    ['o1', 'k1', 'sample_received', '2026-09-08T00:00:00Z'],
    ['o1', 'k1', 'qc_failed', '2026-09-10T00:00:00Z'],
    ['o1', 'k1', 'kit_replaced', '2026-09-11T00:00:00Z'],
    ['o1', 'k2', 'kit_shipped', '2026-09-13T00:00:00Z'],
    ['o1', 'k2', 'kit_delivered', '2026-09-15T00:00:00Z'],
  ];

  it('chains kits and measures the new kit from the replacement time', () => {
    const ds = build([{ id: 'o1', created: '2026-09-01T00:00:00Z' }], events);
    const o = order(ds, 'o1');
    expect(o.kitIds).toEqual(['k1', 'k2']);
    expect(kit(ds, 'k1').state).toBe('replaced');
    expect(duration(ds, kit(ds, 'k1'), 'qc')).toBe(2);
    const k2 = kit(ds, 'k2');
    expect(k2.startMs).toBe(AT('2026-09-11T00:00:00Z'));
    expect(duration(ds, k2, 'fulfillment')).toBe(2);
    expect(k2.stage).toBe('customer');
    expect(o.position).toBe('customer');
  });

  it('flags a failed QC with no replacement after 3 days', () => {
    const ds = build([{ id: 'o1' }], events.slice(0, 5));
    const o = order(ds, 'o1');
    expect(o.position).toBe('qc_failed');
    expect(o.stuck).toMatchObject({
      stage: 'replacement',
      owner: 'Fulfillment',
      reason: 'QC failed, replacement not issued',
      kitId: 'k1',
    });
  });

  it('flags a replacement kit that was never shipped', () => {
    const ds = build([{ id: 'o1' }], events.slice(0, 6));
    const o = order(ds, 'o1');
    expect(o.position).toBe('fulfillment');
    expect(o.stuck).toMatchObject({ stage: 'fulfillment', reason: 'Replacement kit not shipped' });
    expect(o.stuck?.sinceMs).toBe(AT('2026-09-11T00:00:00Z'));
  });
});

describe('stuck detection', () => {
  it('assigns owner and severity from elapsed time at as-of', () => {
    const asOf = AT('2026-10-20T00:00:00Z');
    const ds = build(
      [
        { id: 'fresh', created: '2026-10-18T00:00:00Z' },
        { id: 'overdue', created: '2026-10-15T00:00:00Z' },
        { id: 'critical', created: '2026-10-01T00:00:00Z' },
        { id: 'carrier', created: '2026-09-01T00:00:00Z' },
        { id: 'customer', created: '2026-08-01T00:00:00Z' },
      ],
      [
        ['carrier', 'kc', 'kit_shipped', '2026-10-10T00:00:00Z'],
        ['customer', 'ku', 'kit_shipped', '2026-08-02T00:00:00Z'],
        ['customer', 'ku', 'kit_delivered', '2026-08-05T00:00:00Z'],
      ],
      asOf,
    );
    expect(order(ds, 'fresh').stuck).toBeNull();
    expect(order(ds, 'overdue').stuck).toMatchObject({
      owner: 'Fulfillment',
      severity: 'overdue',
      daysWaiting: 5,
      overdueDays: 2,
      targetDays: 3,
    });
    expect(order(ds, 'critical').stuck?.severity).toBe('critical');
    expect(order(ds, 'carrier').stuck).toMatchObject({
      stage: 'outbound',
      owner: 'Carrier',
      daysWaiting: 10,
      severity: 'overdue',
    });
    expect(order(ds, 'customer').stuck).toMatchObject({
      stage: 'customer',
      owner: 'Customer',
      daysWaiting: 76,
      severity: 'overdue',
    });
  });

  it('never marks closed, test, completed or upload-only orders as stuck', () => {
    const ds = build(
      [
        { id: 'cancelled', created: '2026-06-01T00:00:00Z', status: 'cancelled' },
        { id: 'refunded', created: '2026-06-01T00:00:00Z', status: 'refunded' },
        { id: 'test', created: '2026-06-01T00:00:00Z', test: true },
        { id: 'upload', created: '2026-06-01T00:00:00Z', product: 'upload_only' },
      ],
      [
        ['cancelled', 'k1', 'kit_shipped', '2026-06-02T00:00:00Z'],
        ['refunded', 'k2', 'kit_shipped', '2026-06-02T00:00:00Z'],
        ['refunded', 'k2', 'kit_delivered', '2026-06-04T00:00:00Z'],
      ],
    );
    for (const o of ds.orders) expect(o.stuck).toBeNull();
    expect(order(ds, 'cancelled').position).toBe('closed');
    expect(order(ds, 'refunded').position).toBe('closed');
    expect(order(ds, 'upload').position).toBe('upload_only');
    expect(order(ds, 'test').position).toBe('fulfillment');
    // Transitions that did happen on a refunded order still count.
    expect(duration(ds, kit(ds, 'k2'), 'outbound')).toBe(2);
    expect(kit(ds, 'k2').state).toBe('closed');
  });

  it('flags kit events on an upload-only order', () => {
    const ds = build(
      [{ id: 'u1', product: 'upload_only' }],
      [['u1', 'k1', 'kit_shipped', '2026-09-02T00:00:00Z']],
    );
    expect(order(ds, 'u1').flags).toContain('upload_only_with_kits');
    expect(order(ds, 'u1').position).toBe('outbound');
    expect(issueCount(ds, 'upload_only_with_kits')).toBe(1);
  });
});

describe('as-of robustness', () => {
  it('ignores a typo far in the future when deriving as-of', () => {
    const orders = Array.from({ length: 120 }, (_, i) => ({
      id: `o${i}`,
      created: new Date(Date.parse('2026-09-01T00:00:00Z') + i * 3_600_000).toISOString(),
    }));
    const events: EventInput[] = [
      ['o1', 'k1', 'kit_shipped', '2026-09-08T00:00:00Z'],
      ['o1', 'k1', 'kit_delivered', '2030-01-01T00:00:00Z', 'typo'],
    ];
    const ds = analyzeFiles(
      [
        { name: 'o.csv', content: ordersCsv(orders) },
        { name: 'e.csv', content: eventsCsv(events) },
      ],
      { source: 'upload', label: 'test' },
    );
    expect(ds.meta.asOf).toBe(AT('2026-09-08T00:00:00Z'));
    expect(issueCount(ds, 'timestamp_outliers')).toBe(1);
    expect(issueCount(ds, 'events_after_as_of')).toBe(1);
    expect(kit(ds, 'k1').stage).toBe('outbound');
  });

  it('never trims a dense tail', () => {
    expect(robustLatest([1, 2, 3, 4]).asOf).toBe(4);
    const days = Array.from({ length: 300 }, (_, i) => i * 86_400_000);
    expect(robustLatest(days)).toEqual({ asOf: days[299], outliers: [] });
  });

  it('excludes orders placed after an as-of override', () => {
    const ds = build(
      [
        { id: 'early', created: '2026-09-01T00:00:00Z' },
        { id: 'late', created: '2026-11-01T00:00:00Z' },
      ],
      [['late', 'k1', 'kit_shipped', '2026-11-02T00:00:00Z']],
    );
    expect(ds.orders.map((o) => o.id)).toEqual(['early']);
    expect(ds.kits).toHaveLength(0);
    expect(issueCount(ds, 'orders_after_as_of')).toBe(1);
  });

  it('warns when the events file has no usable rows', () => {
    const ds = build([{ id: 'o1' }], [['o1', 'k1', 'kit_shipped', 'garbage']]);
    expect(issueCount(ds, 'no_kit_events')).toBe(1);
    expect(order(ds, 'o1').stuck?.reason).toBe('Kit not shipped');
  });
});
