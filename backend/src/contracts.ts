/**
 * API contract shared by the backend and the frontend (the frontend imports these types only).
 * All timestamps are epoch milliseconds (UTC). All durations are calendar days (fractional).
 */

export type MilestoneType =
  | 'kit_shipped'
  | 'kit_delivered'
  | 'sample_mailed'
  | 'sample_received'
  | 'qc_passed'
  | 'qc_failed'
  | 'sequencing_complete'
  | 'report_ready';

export type EventType = MilestoneType | 'kit_replaced';

export type StageKey =
  'fulfillment' | 'outbound' | 'customer' | 'return' | 'qc' | 'sequencing' | 'report';

export type Owner = 'Fulfillment' | 'Carrier' | 'Customer' | 'Lab';

/** Where an order currently is. Stage keys mean "waiting for that stage to finish". */
export type Position = StageKey | 'qc_failed' | 'completed' | 'closed' | 'upload_only';

export type KitState = 'in_progress' | 'completed' | 'replaced' | 'closed' | 'qc_failed';

export type Severity = 'overdue' | 'critical';

export interface StageDef {
  key: StageKey;
  label: string;
  /** Short label for compact UIs, e.g. "Shipped → Delivered". */
  from: string;
  to: string;
  targetDays: number;
  owner: Owner;
}

export interface StuckInfo {
  stage: StageKey | 'replacement';
  owner: Owner;
  reason: string;
  kitId: string | null;
  sinceMs: number;
  daysWaiting: number;
  targetDays: number;
  overdueDays: number;
  severity: Severity;
}

export interface OrderDto {
  id: string;
  createdAt: number;
  customerId: string;
  product: string;
  country: string;
  status: string;
  isTest: boolean;
  /**
   * Kits in replacement order: kitIds[i + 1] replaced kitIds[i].
   * An upload_only order without kits has position 'upload_only' (not part of the kit pipeline).
   */
  kitIds: string[];
  position: Position;
  stuck: StuckInfo | null;
  /** Order created → report ready of the final kit, across replacements (completed orders). */
  e2eDays: number | null;
  flags: string[];
}

export interface KitDto {
  id: string;
  orderId: string;
  /** Start of the fulfillment stage: order creation, or the kit_replaced time of the previous kit. */
  startMs: number;
  /** Aligned with Dataset.eventTypes. null = not observed. */
  milestones: (number | null)[];
  /** Milestones that were never scanned but must have happened because a later one did. */
  inferred: MilestoneType[];
  state: KitState;
  /** Stage the kit is waiting on (in_progress kits), or where it stopped (closed kits). */
  stage: StageKey | null;
  /** Aligned with Dataset.stages. null = not measurable (boundary missing, inferred or not reached). */
  durations: (number | null)[];
  flags: string[];
  /** Raw events for the drill-down, in time order, including marked duplicates. */
  events: EventTuple[];
}

/**
 * Compact event tuple (keeps the payload under the 4 MB serverless response limit):
 * [eventId, eventTypeIndex, atMs, sourceIndex, rawTimestamp | null, flags]
 * eventTypeIndex points into Dataset.eventTypes and sourceIndex into Dataset.sources.
 * rawTimestamp is only sent when the export did not already use canonical UTC ("...Z").
 */
export type EventTuple = [string, number, number, number, string | null, number];

/** Bit flags used in EventTuple[5]. */
export const EVENT_FLAG = {
  duplicate: 1,
  naiveTimezone: 2,
  conflict: 4,
} as const;

export interface QualityIssue {
  code: string;
  title: string;
  level: 'info' | 'warning' | 'error';
  count: number;
  decision: string;
  examples: string[];
}

export interface DatasetMeta {
  source: 'sample' | 'upload';
  label: string;
  asOf: number;
  asOfSource: 'export_date' | 'latest_timestamp' | 'override';
  counts: {
    orderRows: number;
    eventRows: number;
    orders: number;
    kits: number;
    events: number;
  };
}

export interface Dataset {
  meta: DatasetMeta;
  stages: StageDef[];
  eventTypes: EventType[];
  orders: OrderDto[];
  kits: KitDto[];
  sources: string[];
  quality: QualityIssue[];
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
