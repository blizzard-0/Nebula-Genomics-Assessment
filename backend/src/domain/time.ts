export const DAY_MS = 86_400_000;

export type TimestampKind = 'utc' | 'offset' | 'naive';

export interface ParsedTimestamp {
  ms: number;
  kind: TimestampKind;
}

// YYYY-MM-DD, optional [T or space]HH:MM[:SS[.fff]], optional Z / ±HH:MM / ±HHMM / ±HH
const ISO_LIKE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Normalizes the timestamp shapes found in the exports to epoch ms.
 * Timestamps without a zone are read as UTC and reported as `naive` so callers can flag them.
 * Returns null for anything that is not a real calendar instant.
 */
export function parseTimestamp(input: string): ParsedTimestamp | null {
  const value = input.trim();
  const m = ISO_LIKE.exec(value);
  if (!m) return null;

  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '', zone] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const millis = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  let ms = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  // Reject roll-overs such as 2026-02-31.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  let kind: TimestampKind = 'naive';
  if (zone === 'Z' || zone === 'z') {
    kind = 'utc';
  } else if (zone) {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offH = Number(digits.slice(0, 2));
    const offM = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (offH > 18 || offM > 59) return null;
    ms -= sign * (offH * 60 + offM) * 60_000;
    kind = 'offset';
  }
  return { ms, kind };
}

export function daysBetween(fromMs: number, toMs: number): number {
  return (toMs - fromMs) / DAY_MS;
}

export function isCanonicalUtc(raw: string, ms: number): boolean {
  return raw === new Date(ms).toISOString().slice(0, 19) + 'Z';
}
