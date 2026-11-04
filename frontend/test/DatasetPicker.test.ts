import type { Dataset } from '@contracts';
import { mount } from '@vue/test-utils';
import { IDBFactory } from 'fake-indexeddb';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type * as ClientModule from '@/api/client';
import * as api from '@/api/client';
import DatasetPicker from '@/components/DatasetPicker.vue';
import { useDatasetStore } from '@/stores/dataset';
import { makeDataset, makeOrder } from './fixtures';

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, analyzeFiles: vi.fn(), fetchSampleDataset: vi.fn(), fetchHealth: vi.fn() };
});

function dataset(asOf: string): Dataset {
  const ds = makeDataset([makeOrder('o1')], []);
  return { ...ds, meta: { ...ds.meta, asOf: Date.parse(asOf) } };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.mocked(api.fetchSampleDataset).mockResolvedValue(dataset('2026-10-20T00:00:00Z'));
  vi.mocked(api.fetchHealth).mockResolvedValue({ status: 'ok', engineVersion: '2' });
  vi.mocked(api.analyzeFiles).mockResolvedValue({
    ...dataset('2026-09-01T00:00:00Z'),
    meta: { ...dataset('2026-09-01T00:00:00Z').meta, source: 'upload' },
  });
});

describe('DatasetPicker', () => {
  it('shows the open dataset and switches to another one', async () => {
    setActivePinia(createPinia());
    const store = useDatasetStore();
    await store.init();
    const upload = await store.upload([
      new File(['order_id\nX'], 'orders.csv'),
      new File(['kit_id\nX'], 'kit_events.csv'),
    ]);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
    });
    const wrapper = mount(DatasetPicker, { global: { plugins: [router] } });
    expect(wrapper.find('[data-testid=dataset-name]').text()).toBe('Export as of 01 Sept 2026');

    await wrapper.find('[data-testid=dataset-picker]').trigger('click');
    const items = wrapper.findAll('[role=menuitemradio]');
    expect(items.map((i) => i.attributes('aria-checked'))).toEqual(['false', 'true']);
    expect(items[0]?.text()).toContain('Sample export');

    await items[0]?.trigger('click');
    await vi.waitFor(() => expect(store.activeId).toBe('sample'));
    expect(wrapper.find('[data-testid=dataset-name]').text()).toBe('Sample export');
    expect(upload.outcome).toBe('saved');
  });
});
