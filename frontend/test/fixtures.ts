import type { Dataset, KitDto, OrderDto, StuckInfo } from '@contracts';

export const STAGES: Dataset['stages'] = [
  {
    key: 'fulfillment',
    label: 'Fulfillment',
    from: 'a',
    to: 'b',
    targetDays: 3,
    owner: 'Fulfillment',
  },
  {
    key: 'outbound',
    label: 'Outbound shipping',
    from: 'a',
    to: 'b',
    targetDays: 7,
    owner: 'Carrier',
  },
  {
    key: 'customer',
    label: 'Customer sample',
    from: 'a',
    to: 'b',
    targetDays: 45,
    owner: 'Customer',
  },
  { key: 'return', label: 'Return shipping', from: 'a', to: 'b', targetDays: 14, owner: 'Carrier' },
  { key: 'qc', label: 'QC', from: 'a', to: 'b', targetDays: 7, owner: 'Lab' },
  { key: 'sequencing', label: 'Sequencing', from: 'a', to: 'b', targetDays: 28, owner: 'Lab' },
  { key: 'report', label: 'Report', from: 'a', to: 'b', targetDays: 5, owner: 'Lab' },
];

export const EVENT_TYPES: Dataset['eventTypes'] = [
  'kit_shipped',
  'kit_delivered',
  'sample_mailed',
  'sample_received',
  'qc_passed',
  'qc_failed',
  'sequencing_complete',
  'report_ready',
  'kit_replaced',
];

export const AS_OF = Date.parse('2026-10-20T00:00:00Z');

export function makeOrder(id: string, patch: Partial<OrderDto> = {}): OrderDto {
  return {
    id,
    createdAt: Date.parse('2026-09-01T00:00:00Z'),
    customerId: `cus_${id}`,
    product: 'wgs_30x',
    country: 'US',
    status: 'paid',
    isTest: false,
    kitIds: [],
    position: 'fulfillment',
    stuck: null,
    e2eDays: null,
    flags: [],
    ...patch,
  };
}

export function makeKit(id: string, orderId: string, patch: Partial<KitDto> = {}): KitDto {
  return {
    id,
    orderId,
    startMs: Date.parse('2026-09-01T00:00:00Z'),
    milestones: EVENT_TYPES.map(() => null),
    inferred: [],
    state: 'in_progress',
    stage: 'outbound',
    durations: STAGES.map(() => null),
    flags: [],
    events: [],
    ...patch,
  };
}

export function makeStuck(patch: Partial<StuckInfo> = {}): StuckInfo {
  return {
    stage: 'customer',
    owner: 'Customer',
    reason: 'Delivered, customer has not mailed the sample',
    kitId: null,
    sinceMs: Date.parse('2026-08-01T00:00:00Z'),
    daysWaiting: 80,
    targetDays: 45,
    overdueDays: 35,
    severity: 'overdue',
    ...patch,
  };
}

export function makeDataset(orders: OrderDto[], kits: KitDto[]): Dataset {
  return {
    meta: {
      source: 'sample',
      engineVersion: '2',
      label: 'test',
      asOf: AS_OF,
      asOfSource: 'export_date',
      counts: {
        orderRows: orders.length,
        eventRows: 0,
        orders: orders.length,
        kits: kits.length,
        events: 0,
      },
    },
    stages: STAGES,
    eventTypes: EVENT_TYPES,
    orders,
    kits,
    sources: ['system'],
    quality: [],
  };
}
