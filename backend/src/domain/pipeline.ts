import type { EventType, MilestoneType, Owner, StageDef, StageKey } from '../contracts.js';

/** Event types in pipeline order; indices are used by KitDto.milestones and EventTuple. */
export const EVENT_TYPES: readonly EventType[] = [
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

export const EVENT_TYPE_INDEX = new Map<string, number>(EVENT_TYPES.map((t, i) => [t, i]));

/**
 * Pipeline steps in the order a kit reaches them. QC is one step with two outcomes.
 * A later step being present proves every earlier step happened.
 */
export const MILESTONE_STEPS: readonly (readonly MilestoneType[])[] = [
  ['kit_shipped'],
  ['kit_delivered'],
  ['sample_mailed'],
  ['sample_received'],
  ['qc_passed', 'qc_failed'],
  ['sequencing_complete'],
  ['report_ready'],
];

/** Stage targets from the brief (calendar days). The owner is who to chase when it is overdue. */
export const STAGES: readonly StageDef[] = [
  {
    key: 'fulfillment',
    label: 'Fulfillment',
    from: 'Order placed',
    to: 'Kit shipped',
    targetDays: 3,
    owner: 'Fulfillment',
  },
  {
    key: 'outbound',
    label: 'Outbound shipping',
    from: 'Kit shipped',
    to: 'Delivered',
    targetDays: 7,
    owner: 'Carrier',
  },
  {
    key: 'customer',
    label: 'Customer sample',
    from: 'Delivered',
    to: 'Sample mailed',
    targetDays: 45,
    owner: 'Customer',
  },
  {
    key: 'return',
    label: 'Return shipping',
    from: 'Sample mailed',
    to: 'Received at lab',
    targetDays: 14,
    owner: 'Carrier',
  },
  { key: 'qc', label: 'QC', from: 'Received at lab', to: 'QC result', targetDays: 7, owner: 'Lab' },
  {
    key: 'sequencing',
    label: 'Sequencing',
    from: 'QC passed',
    to: 'Sequencing complete',
    targetDays: 28,
    owner: 'Lab',
  },
  {
    key: 'report',
    label: 'Report',
    from: 'Sequencing complete',
    to: 'Report ready',
    targetDays: 5,
    owner: 'Lab',
  },
];

/**
 * Stage i ends at MILESTONE_STEPS[i]. It starts at MILESTONE_STEPS[i - 1]
 * (or at the kit start for fulfillment). Sequencing only starts from qc_passed.
 */
export const STAGE_INDEX = new Map<StageKey, number>(STAGES.map((s, i) => [s.key, i]));

/** After a failed QC a replacement kit should be issued within this many days. */
export const REPLACEMENT_TARGET_DAYS = 3;
export const REPLACEMENT_OWNER: Owner = 'Fulfillment';

/** Multiple of the target after which an overdue item becomes critical. */
export const CRITICAL_FACTOR = 2;

export const UPLOAD_ONLY_PRODUCT = 'upload_only';
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(['cancelled', 'refunded']);
export const KNOWN_STATUSES: ReadonlySet<string> = new Set(['paid', 'cancelled', 'refunded']);
export const KNOWN_PRODUCTS: ReadonlySet<string> = new Set([
  'wgs_30x',
  'wgs_100x',
  UPLOAD_ONLY_PRODUCT,
]);
