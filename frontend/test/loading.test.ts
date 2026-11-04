import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import TopProgressBar from '@/components/TopProgressBar.vue';
import { datasetColor, datasetKindLabel, SAMPLE_COLOR } from '@/lib/datasetColor';
import { isLoading, resetLoading, startLoading, track } from '@/lib/loading';

beforeEach(() => resetLoading());
afterEach(() => vi.useRealTimers());

describe('loading state', () => {
  it('stays on until every piece of work has finished', () => {
    const a = startLoading();
    const b = startLoading();
    expect(isLoading.value).toBe(true);
    a();
    a(); // stopping twice has no effect
    expect(isLoading.value).toBe(true);
    b();
    expect(isLoading.value).toBe(false);
  });

  it('tracks async work, including failures', async () => {
    let seen = false;
    await track(async () => {
      seen = isLoading.value;
    });
    expect(seen).toBe(true);
    expect(isLoading.value).toBe(false);
    await expect(track(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(isLoading.value).toBe(false);
  });
});

describe('TopProgressBar', () => {
  it('shows while loading, fills up, then hides, staying visible for a moment', async () => {
    vi.useFakeTimers();
    const wrapper = mount(TopProgressBar);
    const bar = () => wrapper.get('[data-testid=top-progress]');
    expect(bar().attributes('data-active')).toBe('false');

    const stop = startLoading();
    await nextTick();
    expect(bar().attributes('data-active')).toBe('true');
    vi.advanceTimersByTime(600);
    await nextTick();
    const midway = Number(bar().attributes('aria-valuenow'));
    expect(midway).toBeGreaterThan(12);
    expect(midway).toBeLessThan(91);

    stop();
    await nextTick();
    expect(bar().attributes('data-active')).toBe('true');
    vi.advanceTimersByTime(10);
    await nextTick();
    expect(bar().attributes('aria-valuenow')).toBe('100');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(bar().attributes('data-active')).toBe('false');
  });

  it('gives even instant work a visible flash', async () => {
    vi.useFakeTimers();
    const wrapper = mount(TopProgressBar);
    const stop = startLoading();
    await nextTick();
    stop();
    await nextTick();
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(wrapper.get('[data-testid=top-progress]').attributes('data-active')).toBe('true');
  });
});

describe('dataset colors', () => {
  it('gives the sample the accent and every upload a stable color', () => {
    expect(datasetColor('sample')).toBe(SAMPLE_COLOR);
    expect(datasetColor('abc123')).toBe(datasetColor('abc123'));
    expect(datasetColor('abc123')).toMatch(/^#[0-9a-f]{6}$/);
    expect(datasetKindLabel('saved')).toBe('Your upload');
  });
});
