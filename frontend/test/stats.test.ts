import { describe, expect, it } from 'vitest';
import { histogram, median, niceBinWidth, p90, quantile, ratio } from '@/lib/stats';

describe('stats', () => {
  it('computes median for odd and even counts, ignoring input order', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('interpolates p90 between ranks', () => {
    const values = Array.from({ length: 11 }, (_, i) => i * 10); // 0..100
    expect(p90(values)).toBe(90);
    expect(quantile([1, 2], 0.9)).toBeCloseTo(1.9);
    expect(p90([7])).toBe(7);
  });

  it('guards ratios against empty denominators', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(0, 0)).toBeNull();
  });

  it('bins values and keeps the tail in an overflow bin', () => {
    const bins = histogram([0.5, 1.2, 1.9, 2.5, 30], 1, 3);
    expect(bins.map((b) => b.count)).toEqual([1, 2, 1, 1]);
    expect(bins.at(-1)?.to).toBe(Infinity);
  });

  it('picks readable bin widths', () => {
    expect(niceBinWidth(10)).toBe(0.5);
    expect(niceBinWidth(24)).toBe(1);
    expect(niceBinWidth(100)).toBe(5);
  });
});
