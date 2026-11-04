/** Quantile with linear interpolation between closest ranks (same as numpy's default). */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (pos - lo);
}

export const median = (values: readonly number[]): number | null => quantile(values, 0.5);
export const p90 = (values: readonly number[]): number | null => quantile(values, 0.9);

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/**
 * Fixed-width histogram. The last bin collects everything above `max` so long tails stay
 * visible without flattening the chart.
 */
export function histogram(values: readonly number[], binWidth: number, max: number): Bin[] {
  const bins: Bin[] = [];
  const n = Math.max(1, Math.ceil(max / binWidth));
  for (let i = 0; i < n; i++) bins.push({ from: i * binWidth, to: (i + 1) * binWidth, count: 0 });
  bins.push({ from: n * binWidth, to: Infinity, count: 0 });
  for (const v of values) {
    const i = Math.min(n, Math.max(0, Math.floor(v / binWidth)));
    const bin = bins[i];
    if (bin) bin.count++;
  }
  return bins;
}

/** A "nice" bin width so a histogram has roughly `target` bins up to `max`. */
export function niceBinWidth(max: number, target = 24): number {
  const raw = max / target;
  if (raw <= 0.25) return 0.25;
  if (raw <= 0.5) return 0.5;
  if (raw <= 1) return 1;
  if (raw <= 2) return 2;
  if (raw <= 5) return 5;
  return Math.ceil(raw / 5) * 5;
}
