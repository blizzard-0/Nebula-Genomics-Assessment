import type { Dataset, EventType, KitDto, OrderDto, StageKey } from '@contracts';

/** Lookups built once per dataset. */
export interface DatasetIndex {
  ordersById: Map<string, OrderDto>;
  kitsById: Map<string, KitDto>;
  /** kit id → order id, used by search. */
  orderByKit: Map<string, string>;
  ordersByCustomer: Map<string, OrderDto[]>;
  products: string[];
  countries: string[];
  statuses: string[];
  typeIndex: Map<EventType, number>;
  stageIndex: Map<StageKey, number>;
}

const PRODUCT_ORDER = ['wgs_30x', 'wgs_100x', 'upload_only'];

function sortedValues(values: Iterable<string>, preferred: string[] = []): string[] {
  const set = new Set(values);
  const first = preferred.filter((v) => set.has(v));
  const rest = [...set].filter((v) => !preferred.includes(v)).sort();
  return [...first, ...rest];
}

export function indexDataset(ds: Dataset): DatasetIndex {
  const ordersById = new Map(ds.orders.map((o) => [o.id, o]));
  const kitsById = new Map(ds.kits.map((k) => [k.id, k]));
  const orderByKit = new Map(ds.kits.map((k) => [k.id, k.orderId]));
  const ordersByCustomer = new Map<string, OrderDto[]>();
  for (const o of ds.orders) {
    if (!o.customerId) continue;
    const list = ordersByCustomer.get(o.customerId) ?? [];
    list.push(o);
    ordersByCustomer.set(o.customerId, list);
  }
  // Countries are listed by volume so the common ones come first.
  const countryCounts = new Map<string, number>();
  for (const o of ds.orders) countryCounts.set(o.country, (countryCounts.get(o.country) ?? 0) + 1);
  const countries = [...countryCounts.entries()]
    .filter(([c]) => c !== '')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);

  return {
    ordersById,
    kitsById,
    orderByKit,
    ordersByCustomer,
    products: sortedValues(
      ds.orders.map((o) => o.product),
      PRODUCT_ORDER,
    ),
    countries,
    statuses: sortedValues(
      ds.orders.map((o) => o.status),
      ['paid', 'refunded', 'cancelled'],
    ),
    typeIndex: new Map(ds.eventTypes.map((t, i) => [t, i])),
    stageIndex: new Map(ds.stages.map((s, i) => [s.key, i])),
  };
}

export function milestoneAt(ds: Dataset, kit: KitDto, type: EventType): number | null {
  const i = ds.eventTypes.indexOf(type);
  return i < 0 ? null : (kit.milestones[i] ?? null);
}

export function stageDuration(ds: Dataset, kit: KitDto, stage: StageKey): number | null {
  const i = ds.stages.findIndex((s) => s.key === stage);
  return i < 0 ? null : (kit.durations[i] ?? null);
}

export function kitsOfOrder(index: DatasetIndex, order: OrderDto): KitDto[] {
  return order.kitIds.flatMap((id) => {
    const kit = index.kitsById.get(id);
    return kit ? [kit] : [];
  });
}

export interface SearchHit {
  kind: 'order' | 'kit' | 'customer';
  id: string;
  orderId: string;
  label: string;
}

/** Finds orders by order id, kit id or customer id (prefix match, case-insensitive). */
export function searchIds(ds: Dataset, index: DatasetIndex, query: string, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: SearchHit[] = [];
  const exact = index.ordersById.get(q);
  if (exact) hits.push({ kind: 'order', id: exact.id, orderId: exact.id, label: exact.product });
  for (const o of ds.orders) {
    if (hits.length >= limit) break;
    if (o.id !== q && o.id.toLowerCase().includes(q)) {
      hits.push({ kind: 'order', id: o.id, orderId: o.id, label: o.product });
    }
  }
  for (const k of ds.kits) {
    if (hits.length >= limit) break;
    if (k.id.toLowerCase().includes(q)) {
      hits.push({ kind: 'kit', id: k.id, orderId: k.orderId, label: `on ${k.orderId}` });
    }
  }
  for (const [customer, orders] of index.ordersByCustomer) {
    if (hits.length >= limit) break;
    if (customer.toLowerCase().includes(q)) {
      for (const o of orders.slice(0, limit - hits.length)) {
        hits.push({ kind: 'customer', id: customer, orderId: o.id, label: `order ${o.id}` });
      }
    }
  }
  return hits.slice(0, limit);
}
