import type { Dataset, KitDto, OrderDto } from '../src/contracts.js';
import { buildDataset } from '../src/domain/buildDataset.js';
import { parseCsv } from '../src/domain/csv.js';

export const ORDERS_HEADER = 'order_id,created_at,customer_id,product,country,status,is_test';
export const EVENTS_HEADER = 'event_id,order_id,kit_id,event_type,occurred_at,source';

export interface OrderInput {
  id: string;
  created?: string;
  product?: string;
  status?: string;
  test?: boolean;
  country?: string;
}

export function ordersCsv(orders: OrderInput[]): string {
  return [
    ORDERS_HEADER,
    ...orders.map((o) =>
      [
        o.id,
        o.created ?? '2026-09-01T00:00:00Z',
        `cus_${o.id}`,
        o.product ?? 'wgs_30x',
        o.country ?? 'US',
        o.status ?? 'paid',
        String(o.test ?? false),
      ].join(','),
    ),
  ].join('\n');
}

/** [orderId, kitId, eventType, occurredAt, eventId?] */
export type EventInput = [string, string, string, string, string?];

export function eventsCsv(events: EventInput[]): string {
  return [
    EVENTS_HEADER,
    ...events.map(([order, kit, type, at, id], i) =>
      [id ?? `evt_${i}`, order, kit, type, at, 'system'].join(','),
    ),
  ].join('\n');
}

export const AS_OF = Date.parse('2026-10-20T00:00:00Z');

export function build(orders: OrderInput[], events: EventInput[], asOf = AS_OF): Dataset {
  return buildDataset(parseCsv(ordersCsv(orders)), parseCsv(eventsCsv(events)), {
    source: 'upload',
    label: 'test',
    asOf,
    asOfSource: 'override',
  });
}

export function order(ds: Dataset, id: string): OrderDto {
  const o = ds.orders.find((x) => x.id === id);
  if (!o) throw new Error(`order ${id} missing`);
  return o;
}

export function kit(ds: Dataset, id: string): KitDto {
  const k = ds.kits.find((x) => x.id === id);
  if (!k) throw new Error(`kit ${id} missing`);
  return k;
}

export function milestone(ds: Dataset, k: KitDto, type: string): number | null {
  return k.milestones[ds.eventTypes.indexOf(type as Dataset['eventTypes'][number])] ?? null;
}

export function duration(ds: Dataset, k: KitDto, stage: string): number | null {
  return k.durations[ds.stages.findIndex((s) => s.key === stage)] ?? null;
}

export function issueCount(ds: Dataset, code: string): number {
  return ds.quality.find((q) => q.code === code)?.count ?? 0;
}

/** Full happy-path event list for one kit, starting at the given day of September 2026. */
export function fullKit(orderId: string, kitId: string, startDay = 2): EventInput[] {
  const d = (n: number) => `2026-09-${String(n).padStart(2, '0')}T12:00:00Z`;
  return [
    [orderId, kitId, 'kit_shipped', d(startDay)],
    [orderId, kitId, 'kit_delivered', d(startDay + 2)],
    [orderId, kitId, 'sample_mailed', d(startDay + 5)],
    [orderId, kitId, 'sample_received', d(startDay + 8)],
    [orderId, kitId, 'qc_passed', d(startDay + 10)],
    [orderId, kitId, 'sequencing_complete', d(startDay + 20)],
    [orderId, kitId, 'report_ready', d(startDay + 22)],
  ];
}
