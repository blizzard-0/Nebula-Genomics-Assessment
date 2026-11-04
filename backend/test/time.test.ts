import { describe, expect, it } from 'vitest';
import { isCanonicalUtc, parseTimestamp } from '../src/domain/time.js';

describe('parseTimestamp', () => {
  it('reads UTC timestamps', () => {
    expect(parseTimestamp('2026-08-06T14:59:46Z')).toEqual({
      ms: Date.UTC(2026, 7, 6, 14, 59, 46),
      kind: 'utc',
    });
  });

  it('applies negative and positive offsets', () => {
    expect(parseTimestamp('2026-04-30T19:49:51-05:00')?.ms).toBe(Date.UTC(2026, 4, 1, 0, 49, 51));
    expect(parseTimestamp('2026-05-01T13:33:31+10:00')?.ms).toBe(Date.UTC(2026, 4, 1, 3, 33, 31));
    expect(parseTimestamp('2026-05-01T13:33:31+1000')?.kind).toBe('offset');
  });

  it('treats naive timestamps as UTC and reports them', () => {
    expect(parseTimestamp('2026-07-17 18:39:19')).toEqual({
      ms: Date.UTC(2026, 6, 17, 18, 39, 19),
      kind: 'naive',
    });
    expect(parseTimestamp('2026-07-17')?.ms).toBe(Date.UTC(2026, 6, 17));
  });

  it('matches the same instant written in different formats', () => {
    const a = parseTimestamp('2026-10-04T01:27:42Z')?.ms;
    const b = parseTimestamp('2026-10-03T21:27:42-04:00')?.ms;
    const c = parseTimestamp('2026-10-04 01:27:42')?.ms;
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('rejects invalid values', () => {
    for (const bad of [
      '',
      'not a date',
      '2026-13-01T00:00:00Z',
      '2026-02-30T00:00:00Z',
      '2026-01-01T25:00:00Z',
      '1730000000',
    ]) {
      expect(parseTimestamp(bad)).toBeNull();
    }
  });
});

describe('isCanonicalUtc', () => {
  it('only accepts the plain Z format', () => {
    const ms = Date.UTC(2026, 7, 6, 14, 59, 46);
    expect(isCanonicalUtc('2026-08-06T14:59:46Z', ms)).toBe(true);
    expect(isCanonicalUtc('2026-08-06T10:59:46-04:00', ms)).toBe(false);
  });
});
