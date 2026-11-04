import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeFiles } from '../src/domain/buildDataset.js';
import { assertInvariants } from './invariants.js';

const GENERATOR = fileURLToPath(new URL('../scripts/generate-sample-data.mjs', import.meta.url));
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// The hidden test set is produced by the same generator with another seed.
describe.each([1, 42, 777])('generated dataset, seed %i', (seed) => {
  const dir = mkdtempSync(join(tmpdir(), `kit-seed-${seed}-`));
  dirs.push(dir);
  execFileSync(process.execPath, [GENERATOR, String(seed), dir]);
  const files = ['kit_events.csv', 'orders.csv'].map((name) => ({
    name,
    content: readFileSync(join(dir, name)),
  }));
  const ds = analyzeFiles(files, { source: 'upload', label: `seed ${seed}` });

  it('derives as-of from the latest timestamp', () => {
    expect(ds.meta.asOfSource).toBe('latest_timestamp');
    expect(ds.meta.asOf).toBeLessThanOrEqual(Date.parse('2026-10-20T00:00:00Z'));
    expect(ds.meta.asOf).toBeGreaterThan(Date.parse('2026-10-10T00:00:00Z'));
  });

  it('holds the dataset invariants', () => {
    expect(ds.orders).toHaveLength(5000);
    expect(ds.quality.find((q) => q.code === 'orphan_events')?.count).toBe(40);
    assertInvariants(ds);
  });

  it('stays under the 4 MB payload budget', () => {
    expect(Buffer.byteLength(JSON.stringify(ds))).toBeLessThan(4 * 1024 * 1024);
  });
});
