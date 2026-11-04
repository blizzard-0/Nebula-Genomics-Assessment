import type { Dataset, DatasetMeta, EventTuple } from '../contracts.js';
import { ENGINE_VERSION } from '../contracts.js';
import { HttpError } from '../middleware/errors.js';
import { cleanOrders, dedupeEvents, linkEvents, logTimestampKinds, parseEvents } from './clean.js';
import type { CsvKind, CsvTable } from './csv.js';
import { assertColumns, detectKind, KIND_LABEL, parseCsv } from './csv.js';
import { deriveLifecycle } from './lifecycle.js';
import { EVENT_TYPES, STAGES, UPLOAD_ONLY_PRODUCT } from './pipeline.js';
import { QualityLog } from './quality.js';
import { DAY_MS, isCanonicalUtc } from './time.js';

export interface BuildOptions {
  source: DatasetMeta['source'];
  label: string;
  /** Fixed as-of instant (export date or user override). Defaults to the latest timestamp. */
  asOf?: number;
  asOfSource?: DatasetMeta['asOfSource'];
}

/** Builds the dataset from the two parsed exports. */
export function buildDataset(
  ordersTable: CsvTable,
  eventsTable: CsvTable,
  options: BuildOptions,
): Dataset {
  assertColumns('orders', ordersTable.header, 'The orders file');
  assertColumns('events', eventsTable.header, 'The kit events file');

  const log = new QualityLog();
  const orders = cleanOrders(ordersTable, log);
  if (orders.size === 0) {
    throw new HttpError(400, 'no_valid_rows', 'The orders file has no readable rows.');
  }
  const parsed = parseEvents(eventsTable, log);
  logTimestampKinds(parsed, log);

  const { events: linked } = linkEvents(parsed, orders, log);

  let asOf: number;
  let asOfSource = options.asOfSource ?? 'override';
  if (options.asOf !== undefined) {
    asOf = options.asOf;
  } else {
    const times = [...[...orders.values()].map((o) => o.createdAt), ...linked.map((e) => e.at)];
    const latest = robustLatest(times);
    asOf = latest.asOf;
    if (latest.outliers.length > 0) {
      for (const t of latest.outliers) log.add('timestamp_outliers', new Date(t).toISOString());
    }
    asOfSource = 'latest_timestamp';
  }

  // The dashboard is a snapshot at as-of: orders placed later are not part of it yet.
  for (const o of [...orders.values()]) {
    if (o.createdAt <= asOf) continue;
    orders.delete(o.id);
    log.add('orders_after_as_of', `${o.id} (${new Date(o.createdAt).toISOString()})`);
  }

  const inWindow = linked.filter((e) => {
    if (!orders.has(e.orderId)) return false;
    if (e.at <= asOf) return true;
    log.add('events_after_as_of', `${e.id} (${new Date(e.at).toISOString()})`);
    return false;
  });

  const hasKitOrders = [...orders.values()].some((o) => o.product !== UPLOAD_ONLY_PRODUCT);
  if (inWindow.length === 0 && hasKitOrders) {
    log.add('no_kit_events', `${eventsTable.rows.length} event rows in the file`);
  }

  const ordered = dedupeEvents(inWindow, log);
  const { orders: orderDtos, kits } = deriveLifecycle(orders, ordered, asOf, log);

  // Attach raw events (including marked duplicates) to their kit for the drill-down.
  const kitById = new Map(kits.map((k) => [k.id, k]));
  const sources: string[] = [];
  const sourceIndex = new Map<string, number>();
  let countedEvents = 0;
  for (const e of ordered) {
    const kit = kitById.get(e.kitId);
    if (!kit) continue;
    if (e.counted) countedEvents++;
    let si = sourceIndex.get(e.source);
    if (si === undefined) {
      si = sources.push(e.source) - 1;
      sourceIndex.set(e.source, si);
    }
    const tuple: EventTuple = [
      e.id,
      e.typeIndex,
      e.at,
      si,
      isCanonicalUtc(e.raw, e.at) ? null : e.raw,
      e.flags,
    ];
    kit.events.push(tuple);
  }

  return {
    meta: {
      source: options.source,
      engineVersion: ENGINE_VERSION,
      label: options.label,
      asOf,
      asOfSource,
      counts: {
        orderRows: ordersTable.rows.length,
        eventRows: eventsTable.rows.length,
        orders: orderDtos.length,
        kits: kits.length,
        events: countedEvents,
      },
    },
    stages: [...STAGES],
    eventTypes: [...EVENT_TYPES],
    orders: orderDtos,
    kits,
    sources,
    quality: log.list(),
  };
}

/** A timestamp this far after everything else in the export is treated as a typo. */
const OUTLIER_GAP_MS = 7 * DAY_MS;

/**
 * The latest timestamp of the export, ignoring isolated outliers at the top (for example one
 * event typed as 2030). Only the newest 1 % of timestamps can be ignored, and only when a gap
 * of more than 7 days separates them from the rest, so a real export is never cut short.
 */
export function robustLatest(times: readonly number[]): { asOf: number; outliers: number[] } {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { asOf: Date.now(), outliers: [] };
  const maxTrim = Math.floor(n * 0.01);
  let end = n - 1;
  for (let i = n - 1; i > 0 && n - 1 - i < maxTrim; i--) {
    if ((sorted[i] ?? 0) - (sorted[i - 1] ?? 0) > OUTLIER_GAP_MS) end = i - 1;
  }
  return { asOf: sorted[end] ?? 0, outliers: sorted.slice(end + 1) };
}

export interface InputFile {
  name: string;
  content: Buffer | string;
}

/**
 * Builds a dataset from two uploaded files in any order. Each file is identified by its header.
 */
export function analyzeFiles(files: InputFile[], options: BuildOptions): Dataset {
  if (files.length !== 2) {
    throw new HttpError(
      400,
      'wrong_file_count',
      `Upload exactly two CSV files (orders and kit events); received ${files.length}.`,
    );
  }
  const tables = new Map<CsvKind, { table: CsvTable; name: string }>();
  for (const file of files) {
    const table = parseCsv(file.content, file.name);
    const kind = detectKind(table.header);
    if (!kind) {
      throw new HttpError(
        400,
        'unrecognized_file',
        `${file.name} does not look like the orders or the kit events export (columns: ${table.header.join(', ') || 'none'}).`,
        { file: file.name, columns: table.header },
      );
    }
    const existing = tables.get(kind);
    if (existing) {
      throw new HttpError(
        400,
        'duplicate_file_type',
        `Both files look like the ${KIND_LABEL[kind]} export (${existing.name}, ${file.name}). Upload one orders file and one kit events file.`,
      );
    }
    assertColumns(kind, table.header, file.name);
    tables.set(kind, { table, name: file.name });
  }
  const ordersFile = tables.get('orders');
  const eventsFile = tables.get('events');
  if (!ordersFile || !eventsFile) {
    throw new HttpError(400, 'missing_file', 'Upload one orders file and one kit events file.');
  }
  return buildDataset(ordersFile.table, eventsFile.table, options);
}
