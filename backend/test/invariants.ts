import { expect } from 'vitest';
import type { Dataset } from '../src/contracts.js';
import { CLOSED_STATUSES } from '../src/domain/pipeline.js';

/** Properties every dataset must have, whatever the input. */
export function assertInvariants(ds: Dataset): void {
  const orderIds = new Set(ds.orders.map((o) => o.id));
  const kitsById = new Map(ds.kits.map((k) => [k.id, k]));

  // No orphan kits; every kit listed exactly once on its order.
  for (const k of ds.kits) expect(orderIds.has(k.orderId)).toBe(true);
  const listed = ds.orders.flatMap((o) => o.kitIds);
  expect(new Set(listed).size).toBe(ds.kits.length);
  expect(listed.length).toBe(ds.kits.length);

  const qcFailed = ds.eventTypes.indexOf('qc_failed');
  const replaced = ds.eventTypes.indexOf('kit_replaced');
  for (const k of ds.kits) {
    // Milestones are monotonic unless the kit is flagged.
    if (!k.flags.includes('out_of_order')) {
      const times = k.milestones
        .filter((_, i) => i !== replaced && i !== qcFailed)
        .filter((t): t is number => t !== null);
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] ?? 0);
      }
    }
    for (const d of k.durations) if (d !== null) expect(d).toBeGreaterThanOrEqual(0);
    expect(k.durations).toHaveLength(ds.stages.length);
    expect(k.milestones).toHaveLength(ds.eventTypes.length);
  }

  for (const o of ds.orders) {
    for (const id of o.kitIds) expect(kitsById.get(id)?.orderId).toBe(o.id);
    if (o.stuck) {
      // Only active, real orders can be stuck.
      expect(o.isTest).toBe(false);
      expect(CLOSED_STATUSES.has(o.status)).toBe(false);
      expect(['completed', 'closed', 'upload_only']).not.toContain(o.position);
      expect(o.stuck.daysWaiting).toBeGreaterThan(o.stuck.targetDays);
      expect(o.stuck.sinceMs).toBeLessThanOrEqual(ds.meta.asOf);
    }
    if (o.e2eDays !== null) {
      expect(o.position).toBe('completed');
      expect(o.e2eDays).toBeGreaterThan(0);
    }
  }
}
