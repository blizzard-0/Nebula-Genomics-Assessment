import type { QualityIssue } from '../contracts.js';

type IssueDef = Pick<QualityIssue, 'title' | 'level' | 'decision'>;

/**
 * Every data problem the engine knows how to detect, with the decision taken.
 * The order here is the order shown in the Data Quality report.
 */
export const ISSUE_CATALOGUE = {
  invalid_order_rows: {
    title: 'Order rows that could not be read',
    level: 'error',
    decision:
      'Dropped. A row needs an order_id, product, status and a created_at that is a real timestamp.',
  },
  duplicate_order_ids: {
    title: 'Duplicate order_id rows',
    level: 'warning',
    decision: 'Kept the first row for each order_id and ignored the rest.',
  },
  invalid_event_rows: {
    title: 'Event rows that could not be read',
    level: 'error',
    decision:
      'Dropped. A row needs an order_id, kit_id, event_type and an occurred_at that is a real timestamp.',
  },
  unknown_event_types: {
    title: 'Unknown event types',
    level: 'warning',
    decision: 'Dropped: the event is not part of the pipeline described in the brief.',
  },
  naive_timestamps: {
    title: 'Timestamps without a time zone',
    level: 'warning',
    decision:
      'Read as UTC (the export is otherwise UTC-first). At most a few hours of error on multi-day stages; the events are marked in the order view.',
  },
  offset_timestamps: {
    title: 'Timestamps with a local UTC offset',
    level: 'info',
    decision: 'Converted to UTC. Every date in the app is shown in UTC.',
  },
  duplicate_events: {
    title: 'Duplicate events (same kit, event type and instant)',
    level: 'warning',
    decision:
      'Counted once. The copies have new event_ids and often a different time zone format, so duplicates are matched on the instant, not the text. Copies stay visible, marked, in the order view.',
  },
  conflicting_events: {
    title: 'Same event recorded at different times',
    level: 'warning',
    decision:
      'Kept the earliest instant (the first time the step was reported) and marked the others.',
  },
  orphan_events: {
    title: 'Events for orders that do not exist',
    level: 'warning',
    decision:
      'Excluded from every metric. Listed here so they can be chased with the source system.',
  },
  kit_order_conflicts: {
    title: 'Kits that appear under more than one order',
    level: 'warning',
    decision: 'Kept the kit on the order it first appeared with; the other events are excluded.',
  },
  no_kit_events: {
    title: 'No usable kit events',
    level: 'error',
    decision:
      'The kit events file has no rows that could be used, so every kit order looks unshipped. Check that the right file was uploaded.',
  },
  timestamp_outliers: {
    title: 'Timestamps far after the rest of the export',
    level: 'warning',
    decision:
      'Ignored when working out the as-of date: they sit more than 7 days after every other timestamp, so they are almost certainly typos. They fall after the as-of date and are excluded.',
  },
  orders_after_as_of: {
    title: 'Orders placed after the as-of date',
    level: 'warning',
    decision: 'Excluded with their events, so the dashboard reflects the state on the as-of date.',
  },
  events_after_as_of: {
    title: 'Events after the as-of date',
    level: 'warning',
    decision: 'Excluded, so the dashboard reflects the state on the as-of date.',
  },
  missing_kit_shipped: {
    title: 'Missing kit_shipped scan',
    level: 'warning',
    decision:
      'Inferred: a later milestone proves the step happened. Its stage durations are excluded.',
  },
  missing_kit_delivered: {
    title: 'Missing kit_delivered scan',
    level: 'warning',
    decision:
      'Inferred (shown dashed as "no scan") when a later milestone exists. The two stages around it are excluded from turnaround because their boundary is unknown.',
  },
  missing_sample_mailed: {
    title: 'Missing sample_mailed scan',
    level: 'warning',
    decision:
      'Inferred (shown dashed as "no scan") when a later milestone exists. The two stages around it are excluded from turnaround because their boundary is unknown.',
  },
  missing_sample_received: {
    title: 'Missing sample_received scan',
    level: 'warning',
    decision: 'Inferred when a later milestone exists; adjacent stage durations excluded.',
  },
  missing_qc_result: {
    title: 'Missing QC result',
    level: 'warning',
    decision: 'Inferred as passed when sequencing completed; adjacent stage durations excluded.',
  },
  missing_sequencing_complete: {
    title: 'Missing sequencing_complete',
    level: 'warning',
    decision: 'Inferred when a report is ready; adjacent stage durations excluded.',
  },
  out_of_order: {
    title: 'Milestones out of order',
    level: 'warning',
    decision: 'Flagged on the kit. Negative stage durations are excluded from turnaround.',
  },
  implicit_replacements: {
    title: 'New kit without a kit_replaced event on the previous kit',
    level: 'warning',
    decision:
      'Treated as a replacement: the order follows the newest kit, and the old kit counts as replaced.',
  },
  test_orders: {
    title: 'Test orders',
    level: 'info',
    decision:
      'Excluded by default (with their events). The "Include test orders" filter brings them back. Test orders are never flagged as stuck.',
  },
  closed_with_kits: {
    title: 'Cancelled or refunded orders with kit activity',
    level: 'info',
    decision:
      'Counted in volume and their real transitions count toward turnaround, but the order is closed: never stuck, never "in progress".',
  },
  upload_only: {
    title: 'Upload-only orders',
    level: 'info',
    decision:
      'Counted in order volume. No kit is shipped, so they are not part of the kit pipeline.',
  },
  upload_only_with_kits: {
    title: 'Upload-only orders with kit events',
    level: 'warning',
    decision: 'Kept in the pipeline (the events say a kit exists) and flagged for review.',
  },
  unknown_products: {
    title: 'Unknown product codes',
    level: 'warning',
    decision: 'Treated as kit products, so they go through the pipeline like wgs_30x/100x.',
  },
  unknown_statuses: {
    title: 'Unknown order statuses',
    level: 'warning',
    decision: 'Treated as active (like paid), so they can be flagged as stuck.',
  },
} satisfies Record<string, IssueDef>;

export type IssueCode = keyof typeof ISSUE_CATALOGUE;

const MAX_EXAMPLES = 5;

export class QualityLog {
  private readonly counts = new Map<IssueCode, { count: number; examples: string[] }>();

  add(code: IssueCode, example?: string, n = 1): void {
    const entry = this.counts.get(code) ?? { count: 0, examples: [] };
    entry.count += n;
    if (example !== undefined && entry.examples.length < MAX_EXAMPLES) {
      if (!entry.examples.includes(example)) entry.examples.push(example);
    }
    this.counts.set(code, entry);
  }

  count(code: IssueCode): number {
    return this.counts.get(code)?.count ?? 0;
  }

  /** Issues that occurred, in catalogue order. */
  list(): QualityIssue[] {
    return (Object.keys(ISSUE_CATALOGUE) as IssueCode[]).flatMap((code) => {
      const entry = this.counts.get(code);
      if (!entry || entry.count === 0) return [];
      const def: IssueDef = ISSUE_CATALOGUE[code];
      return [{ code, ...def, count: entry.count, examples: entry.examples }];
    });
  }
}
