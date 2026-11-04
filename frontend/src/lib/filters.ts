import type { OrderDto } from '@contracts';

export type DatePreset = 'all' | '30d' | '90d' | 'custom';

export interface Filters {
  /** Order created date range, inclusive, YYYY-MM-DD (UTC). Empty = open. */
  from: string;
  to: string;
  preset: DatePreset;
  products: string[];
  countries: string[];
  statuses: string[];
  includeTest: boolean;
}

export const DEFAULT_FILTERS: Readonly<Filters> = Object.freeze({
  from: '',
  to: '',
  preset: 'all',
  products: [],
  countries: [],
  statuses: [],
  includeTest: false,
});

export type QueryValue = string | null | (string | null)[] | undefined;
export type Query = Record<string, QueryValue>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRESETS: DatePreset[] = ['all', '30d', '90d', 'custom'];

function first(v: QueryValue): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function list(v: QueryValue): string[] {
  const raw = Array.isArray(v) ? v.join(',') : (v ?? '');
  return [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Reads filters from the URL query; unknown or malformed values fall back to defaults. */
export function filtersFromQuery(query: Query): Filters {
  const from = first(query.from);
  const to = first(query.to);
  const presetRaw = first(query.range) as DatePreset;
  const preset: DatePreset = PRESETS.includes(presetRaw)
    ? presetRaw
    : DATE_RE.test(from) || DATE_RE.test(to)
      ? 'custom'
      : 'all';
  return {
    from: preset === 'custom' && DATE_RE.test(from) ? from : '',
    to: preset === 'custom' && DATE_RE.test(to) ? to : '',
    preset,
    products: list(query.product),
    countries: list(query.country),
    statuses: list(query.status),
    includeTest: first(query.test) === '1',
  };
}

/** Writes only the non-default filters, so a clean URL means "everything". */
export function filtersToQuery(f: Filters): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.preset === '30d' || f.preset === '90d') q.range = f.preset;
  if (f.preset === 'custom') {
    if (f.from) q.from = f.from;
    if (f.to) q.to = f.to;
  }
  if (f.products.length) q.product = f.products.join(',');
  if (f.countries.length) q.country = f.countries.join(',');
  if (f.statuses.length) q.status = f.statuses.join(',');
  if (f.includeTest) q.test = '1';
  return q;
}

export const FILTER_KEYS = ['range', 'from', 'to', 'product', 'country', 'status', 'test'] as const;

const DAY = 86_400_000;

/** Resolves the date filter to an epoch range [start, end) against the dataset as-of. */
export function dateRange(f: Filters, asOf: number): { start: number; end: number } {
  if (f.preset === '30d') return { start: asOf - 30 * DAY, end: Infinity };
  if (f.preset === '90d') return { start: asOf - 90 * DAY, end: Infinity };
  if (f.preset === 'custom') {
    const start = f.from ? Date.parse(`${f.from}T00:00:00Z`) : -Infinity;
    const end = f.to ? Date.parse(`${f.to}T00:00:00Z`) + DAY : Infinity;
    return { start, end };
  }
  return { start: -Infinity, end: Infinity };
}

export function applyFilters(orders: readonly OrderDto[], f: Filters, asOf: number): OrderDto[] {
  const { start, end } = dateRange(f, asOf);
  const products = new Set(f.products);
  const countries = new Set(f.countries);
  const statuses = new Set(f.statuses);
  return orders.filter(
    (o) =>
      (f.includeTest || !o.isTest) &&
      o.createdAt >= start &&
      o.createdAt < end &&
      (products.size === 0 || products.has(o.product)) &&
      (countries.size === 0 || countries.has(o.country)) &&
      (statuses.size === 0 || statuses.has(o.status)),
  );
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.preset !== 'all' ? 1 : 0) +
    (f.products.length ? 1 : 0) +
    (f.countries.length ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.includeTest ? 1 : 0)
  );
}
