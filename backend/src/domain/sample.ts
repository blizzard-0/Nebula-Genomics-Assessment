import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../contracts.js';
import { HttpError } from '../middleware/errors.js';
import { analyzeFiles } from './buildDataset.js';

/** The brief states the exports were taken on 2026-10-20. */
export const SAMPLE_AS_OF = Date.parse('2026-10-20T00:00:00Z');

const FILES = ['orders.csv', 'kit_events.csv'] as const;

/**
 * Where the bundled CSVs live: next to the source (local runs and the compiled build), or
 * under the working directory when a serverless bundler has moved the code.
 */
function sampleDir(): string {
  const candidates = [
    fileURLToPath(new URL('../../data/sample/', import.meta.url)),
    join(process.cwd(), 'backend', 'data', 'sample'),
    join(process.cwd(), 'data', 'sample'),
  ];
  const found = candidates.find((dir) => FILES.every((f) => existsSync(join(dir, f))));
  if (!found) {
    throw new HttpError(500, 'sample_missing', 'The bundled sample export could not be found.');
  }
  return found;
}

let cached: { dataset: Dataset; json: string } | null = null;

/** Loads the bundled sample exports once per process. */
export function loadSample(): { dataset: Dataset; json: string } {
  if (cached) return cached;
  const dir = sampleDir();
  const files = FILES.map((name) => ({ name, content: readFileSync(join(dir, name)) }));
  const dataset = analyzeFiles(files, {
    source: 'sample',
    label: 'Sample export (2026-10-20)',
    asOf: SAMPLE_AS_OF,
    asOfSource: 'export_date',
  });
  cached = { dataset, json: JSON.stringify(dataset) };
  return cached;
}
