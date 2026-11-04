import { describe, expect, it } from 'vitest';
import { loadSample, SAMPLE_AS_OF } from '../src/domain/sample.js';
import { issueCount } from './helpers.js';
import { assertInvariants } from './invariants.js';

describe('bundled sample', () => {
  const { dataset: ds, json } = loadSample();

  it('uses the export date from the brief as as-of', () => {
    expect(ds.meta.asOf).toBe(SAMPLE_AS_OF);
    expect(ds.meta.asOfSource).toBe('export_date');
  });

  it('matches the profiled data quality numbers', () => {
    expect(ds.orders).toHaveLength(5000);
    expect(issueCount(ds, 'orphan_events')).toBe(40);
    expect(issueCount(ds, 'duplicate_events')).toBe(469);
    expect(issueCount(ds, 'naive_timestamps')).toBe(248);
    expect(issueCount(ds, 'test_orders')).toBe(67);
    expect(issueCount(ds, 'upload_only')).toBe(740);
    expect(ds.orders.filter((o) => o.position === 'upload_only')).toHaveLength(740);
  });

  it('infers the dropped carrier scans', () => {
    expect(issueCount(ds, 'missing_kit_delivered')).toBeGreaterThan(0);
    expect(issueCount(ds, 'missing_sample_mailed')).toBeGreaterThan(0);
  });

  it('holds the dataset invariants', () => {
    assertInvariants(ds);
  });

  it('keeps the payload under the 4 MB serverless response budget', () => {
    expect(Buffer.byteLength(json)).toBeLessThan(4 * 1024 * 1024);
  });
});
