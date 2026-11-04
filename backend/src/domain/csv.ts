import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { HttpError } from '../middleware/errors.js';

export type CsvKind = 'orders' | 'events';

interface ColumnSpec {
  required: readonly string[];
  optional: readonly string[];
}

export const CSV_SPECS: Record<CsvKind, ColumnSpec> = {
  orders: {
    required: ['order_id', 'created_at', 'product', 'status'],
    optional: ['customer_id', 'country', 'is_test'],
  },
  events: {
    required: ['order_id', 'kit_id', 'event_type', 'occurred_at'],
    optional: ['event_id', 'source'],
  },
};

/** Columns that only one of the two files has; used to tell the files apart. */
const SIGNATURE: Record<CsvKind, readonly string[]> = {
  orders: ['created_at', 'customer_id', 'product', 'country', 'status', 'is_test'],
  events: ['event_id', 'kit_id', 'event_type', 'occurred_at', 'source'],
};

export const KIND_LABEL: Record<CsvKind, string> = {
  orders: 'orders',
  events: 'kit events',
};

export interface CsvTable {
  header: string[];
  rows: Record<string, string>[];
}

const BOM = String.fromCharCode(0xfeff);
const stripBom = (s: string): string => (s.startsWith(BOM) ? s.slice(1) : s);

export function normalizeHeader(name: string): string {
  return stripBom(name)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * True when the start of the file is clearly not text: control bytes, or mostly invalid UTF-8.
 * A few invalid bytes (an accented name saved as Windows-1252) are tolerated.
 */
function looksBinary(text: string): boolean {
  const end = Math.min(text.length, 4096);
  let invalid = 0;
  for (let i = 0; i < end; i++) {
    const c = text.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32)) return true;
    if (c === 0xfffd) invalid++;
  }
  return invalid > end * 0.05;
}

const DELIMITERS = [',', ';', '\t', '|'] as const;

/** Picks the delimiter used in the header line (Excel exports ";" in many locales). */
export function sniffDelimiter(text: string): string {
  const header = stripBom(text).split('\n', 1)[0] ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = header.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Parses CSV text into objects keyed by normalized header (column order does not matter). */
export function parseCsv(input: string | Buffer, fileLabel = 'File'): CsvTable {
  const text = typeof input === 'string' ? input : input.toString('utf8');
  if (stripBom(text).trim() === '') {
    throw new HttpError(400, 'empty_file', `${fileLabel} is empty.`);
  }
  if (looksBinary(text)) {
    throw new HttpError(
      400,
      'not_text',
      `${fileLabel} is not a text CSV file. Export it as CSV (UTF-8) and upload it again.`,
    );
  }
  let records: string[][];
  try {
    records = parse(text, {
      delimiter: sniffDelimiter(text),
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    });
  } catch (err) {
    throw new HttpError(400, 'invalid_csv', `${fileLabel} is not a readable CSV file.`, {
      reason: err instanceof Error ? err.message : String(err),
    });
  }
  const [headerRow, ...body] = records;
  if (!headerRow) throw new HttpError(400, 'empty_file', `${fileLabel} is empty.`);
  const header = headerRow.map(normalizeHeader);
  const rows = body.map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h && !(h in row)) row[h] = cells[i] ?? '';
    });
    return row;
  });
  return { header, rows };
}

/** Works out which export a file is from its header, so upload order does not matter. */
export function detectKind(header: readonly string[]): CsvKind | null {
  const cols = new Set(header);
  const score = (kind: CsvKind) => SIGNATURE[kind].filter((c) => cols.has(c)).length;
  const orders = score('orders');
  const events = score('events');
  if (orders === events) return null;
  return orders > events ? 'orders' : 'events';
}

export function missingColumns(kind: CsvKind, header: readonly string[]): string[] {
  const cols = new Set(header);
  return CSV_SPECS[kind].required.filter((c) => !cols.has(c));
}

export function assertColumns(kind: CsvKind, header: readonly string[], fileLabel: string): void {
  const missing = missingColumns(kind, header);
  if (missing.length === 0) return;
  const plural = missing.length > 1 ? 's' : '';
  throw new HttpError(
    400,
    'missing_columns',
    `${fileLabel} looks like the ${KIND_LABEL[kind]} export but is missing required column${plural}: ${missing.join(', ')}.`,
    { file: fileLabel, kind, missing, expected: CSV_SPECS[kind] },
  );
}

const TRUTHY = new Set(['true', '1', 'yes', 'y', 't']);
const text = z.string().trim();
const required = z.string().trim().min(1);

export const orderRowSchema = z.object({
  order_id: required,
  created_at: required,
  customer_id: text.default(''),
  product: required.transform((v) => v.toLowerCase()),
  country: text.default('').transform((v) => v.toUpperCase()),
  status: required.transform((v) => v.toLowerCase()),
  is_test: text.default('').transform((v) => TRUTHY.has(v.toLowerCase())),
});

export const eventRowSchema = z.object({
  event_id: text.default(''),
  order_id: required,
  kit_id: required,
  event_type: required.transform((v) => v.toLowerCase()),
  occurred_at: required,
  source: text.default('').transform((v) => v.toLowerCase()),
});

export type OrderRow = z.output<typeof orderRowSchema>;
export type EventRow = z.output<typeof eventRowSchema>;
