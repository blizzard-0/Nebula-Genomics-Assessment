import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  applyFilters,
  DEFAULT_FILTERS,
  filtersFromQuery,
  filtersToQuery,
} from '@/lib/filters';
import { AS_OF, makeOrder } from './fixtures';

describe('filters ↔ URL query', () => {
  it('round-trips every filter', () => {
    const f = {
      ...DEFAULT_FILTERS,
      preset: 'custom' as const,
      from: '2026-06-01',
      to: '2026-07-31',
      products: ['wgs_30x', 'wgs_100x'],
      countries: ['US'],
      statuses: ['paid'],
      includeTest: true,
    };
    const q = filtersToQuery(f);
    expect(q).toEqual({
      from: '2026-06-01',
      to: '2026-07-31',
      product: 'wgs_30x,wgs_100x',
      country: 'US',
      status: 'paid',
      test: '1',
    });
    expect(filtersFromQuery(q)).toEqual(f);
  });

  it('writes nothing for the defaults', () => {
    expect(filtersToQuery({ ...DEFAULT_FILTERS })).toEqual({});
    expect(filtersFromQuery({})).toEqual(DEFAULT_FILTERS);
  });

  it('ignores malformed values', () => {
    const f = filtersFromQuery({ range: 'forever', from: 'yesterday', product: ',,', test: 'yes' });
    expect(f).toEqual(DEFAULT_FILTERS);
  });

  it('keeps relative presets relative', () => {
    expect(filtersToQuery({ ...DEFAULT_FILTERS, preset: '30d' })).toEqual({ range: '30d' });
    expect(filtersFromQuery({ range: '90d' }).preset).toBe('90d');
  });

  it('counts active filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, products: ['x'], includeTest: true })).toBe(2);
  });
});

describe('applyFilters', () => {
  const orders = [
    makeOrder('a', { createdAt: Date.parse('2026-10-10T00:00:00Z'), product: 'wgs_30x' }),
    makeOrder('b', {
      createdAt: Date.parse('2026-08-01T00:00:00Z'),
      product: 'wgs_100x',
      country: 'GB',
    }),
    makeOrder('c', { createdAt: Date.parse('2026-05-01T00:00:00Z'), status: 'refunded' }),
    makeOrder('t', { createdAt: Date.parse('2026-10-01T00:00:00Z'), isTest: true }),
  ];
  const ids = (f: Partial<typeof DEFAULT_FILTERS>) =>
    applyFilters(orders, { ...DEFAULT_FILTERS, ...f }, AS_OF).map((o) => o.id);

  it('excludes test orders unless asked', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ includeTest: true })).toEqual(['a', 'b', 'c', 't']);
  });

  it('filters by date preset relative to as-of and by inclusive custom range', () => {
    expect(ids({ preset: '30d' })).toEqual(['a']);
    expect(ids({ preset: '90d' })).toEqual(['a', 'b']);
    expect(ids({ preset: 'custom', from: '2026-08-01', to: '2026-08-01' })).toEqual(['b']);
    expect(ids({ preset: 'custom', to: '2026-07-31' })).toEqual(['c']);
  });

  it('filters by product, country and status', () => {
    expect(ids({ products: ['wgs_100x'] })).toEqual(['b']);
    expect(ids({ countries: ['US'] })).toEqual(['a', 'c']);
    expect(ids({ statuses: ['refunded'] })).toEqual(['c']);
  });
});
