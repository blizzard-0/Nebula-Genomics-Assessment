import type { EventType } from '../contracts.js';
import { EVENT_FLAG } from '../contracts.js';
import type { CsvTable } from './csv.js';
import { eventRowSchema, orderRowSchema } from './csv.js';
import { EVENT_TYPE_INDEX, KNOWN_PRODUCTS, KNOWN_STATUSES } from './pipeline.js';
import type { QualityLog } from './quality.js';
import type { TimestampKind } from './time.js';
import { parseTimestamp } from './time.js';

export interface CleanOrder {
  id: string;
  createdAt: number;
  createdKind: TimestampKind;
  customerId: string;
  product: string;
  country: string;
  status: string;
  isTest: boolean;
}

export interface CleanEvent {
  id: string;
  orderId: string;
  kitId: string;
  type: EventType;
  typeIndex: number;
  at: number;
  kind: TimestampKind;
  source: string;
  raw: string;
  /** EVENT_FLAG bits. */
  flags: number;
  /** False for duplicates and conflicting copies: shown in drill-down, ignored by metrics. */
  counted: boolean;
}

/** Validates order rows: unreadable rows are dropped, duplicate ids keep the first row. */
export function cleanOrders(table: CsvTable, log: QualityLog): Map<string, CleanOrder> {
  const orders = new Map<string, CleanOrder>();
  table.rows.forEach((raw, i) => {
    const line = i + 2;
    const parsed = orderRowSchema.safeParse(raw);
    const ts = parsed.success ? parseTimestamp(parsed.data.created_at) : null;
    if (!parsed.success || !ts) {
      log.add('invalid_order_rows', `line ${line}${raw.order_id ? ` (${raw.order_id})` : ''}`);
      return;
    }
    const row = parsed.data;
    if (orders.has(row.order_id)) {
      log.add('duplicate_order_ids', row.order_id);
      return;
    }
    if (ts.kind === 'naive') log.add('naive_timestamps', `${row.order_id} created_at`);
    if (ts.kind === 'offset') log.add('offset_timestamps', `${row.order_id}: ${row.created_at}`);
    if (!KNOWN_PRODUCTS.has(row.product))
      log.add('unknown_products', `${row.order_id}: ${row.product}`);
    if (!KNOWN_STATUSES.has(row.status))
      log.add('unknown_statuses', `${row.order_id}: ${row.status}`);
    orders.set(row.order_id, {
      id: row.order_id,
      createdAt: ts.ms,
      createdKind: ts.kind,
      customerId: row.customer_id,
      product: row.product,
      country: row.country,
      status: row.status,
      isTest: row.is_test,
    });
  });
  return orders;
}

/** Validates event rows and normalizes their timestamps. Unreadable rows are dropped. */
export function parseEvents(table: CsvTable, log: QualityLog): CleanEvent[] {
  const events: CleanEvent[] = [];
  table.rows.forEach((raw, i) => {
    const line = i + 2;
    const parsed = eventRowSchema.safeParse(raw);
    const ts = parsed.success ? parseTimestamp(parsed.data.occurred_at) : null;
    if (!parsed.success || !ts) {
      log.add('invalid_event_rows', `line ${line}${raw.event_id ? ` (${raw.event_id})` : ''}`);
      return;
    }
    const row = parsed.data;
    const typeIndex = EVENT_TYPE_INDEX.get(row.event_type);
    if (typeIndex === undefined) {
      log.add('unknown_event_types', row.event_type);
      return;
    }
    events.push({
      id: row.event_id || `line_${line}`,
      orderId: row.order_id,
      kitId: row.kit_id,
      type: row.event_type as EventType,
      typeIndex,
      at: ts.ms,
      kind: ts.kind,
      source: row.source,
      raw: row.occurred_at,
      flags: ts.kind === 'naive' ? EVENT_FLAG.naiveTimezone : 0,
      counted: true,
    });
  });
  return events;
}

export interface LinkedEvents {
  /** Events attached to a known order (including marked duplicates). */
  events: CleanEvent[];
  orphans: CleanEvent[];
}

/** Drops events whose order is unknown and keeps each kit on a single order. */
export function linkEvents(
  events: CleanEvent[],
  orders: Map<string, CleanOrder>,
  log: QualityLog,
): LinkedEvents {
  const kept: CleanEvent[] = [];
  const orphans: CleanEvent[] = [];
  const kitOrder = new Map<string, string>();
  for (const e of events) {
    if (!orders.has(e.orderId)) {
      orphans.push(e);
      log.add('orphan_events', `${e.id} → ${e.orderId}`);
      continue;
    }
    const owner = kitOrder.get(e.kitId);
    if (owner === undefined) {
      kitOrder.set(e.kitId, e.orderId);
    } else if (owner !== e.orderId) {
      log.add('kit_order_conflicts', `${e.kitId}: ${owner} / ${e.orderId}`);
      continue;
    }
    kept.push(e);
  }
  return { events: kept, orphans };
}

/**
 * Marks duplicate events. Rows for the same kit and event type at the same instant are one
 * event (the export repeats rows with new ids and a different time zone format). If the same
 * kit and type have different instants, the earliest wins and the others are conflicts.
 * Mutates `flags` and `counted`; returns the events in time order.
 */
export function dedupeEvents(events: CleanEvent[], log: QualityLog): CleanEvent[] {
  const sorted = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
    .map(({ e }) => e);

  const firstByKitType = new Map<string, CleanEvent>();
  const dupGroups = new Set<string>();
  const conflictGroups = new Set<string>();
  for (const e of sorted) {
    const key = `${e.kitId}|${e.type}`;
    const first = firstByKitType.get(key);
    if (!first) {
      firstByKitType.set(key, e);
      continue;
    }
    e.counted = false;
    if (first.at === e.at) {
      e.flags |= EVENT_FLAG.duplicate;
      const group = `${key}|${e.at}`;
      if (!dupGroups.has(group)) {
        dupGroups.add(group);
        log.add('duplicate_events', `${e.kitId} ${e.type} (${first.id} = ${e.id})`);
      }
    } else {
      e.flags |= EVENT_FLAG.conflict;
      if (!conflictGroups.has(key)) {
        conflictGroups.add(key);
        log.add('conflicting_events', `${e.kitId} ${e.type}`);
      }
    }
  }
  return sorted;
}

export function logTimestampKinds(events: CleanEvent[], log: QualityLog): void {
  for (const e of events) {
    if (e.kind === 'naive') log.add('naive_timestamps', `${e.id}: ${e.raw}`);
    else if (e.kind === 'offset') log.add('offset_timestamps', `${e.id}: ${e.raw}`);
  }
}
