import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import StuckTable from '@/components/StuckTable.vue';
import { stuckRows } from '@/lib/metrics';
import { makeDataset, makeOrder, makeStuck } from './fixtures';

const orders = [
  makeOrder('ord_a', { stuck: makeStuck({ overdueDays: 5, daysWaiting: 50, owner: 'Customer' }) }),
  makeOrder('ord_b', {
    stuck: makeStuck({
      overdueDays: 40,
      daysWaiting: 47,
      targetDays: 7,
      owner: 'Carrier',
      stage: 'outbound',
      severity: 'critical',
    }),
  }),
  makeOrder('ord_c', { stuck: makeStuck({ overdueDays: 12, daysWaiting: 57, owner: 'Customer' }) }),
];

async function mountTable(pageSize = 50) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/orders/:id', name: 'order', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const wrapper = mount(StuckTable, {
    props: { rows: stuckRows(orders), dataset: makeDataset(orders, []), pageSize },
    global: { plugins: [router] },
  });
  return { wrapper, router };
}

const orderIds = (wrapper: Awaited<ReturnType<typeof mountTable>>['wrapper']) =>
  wrapper.findAll('[data-testid=stuck-row] td:first-child a').map((a) => a.text());

describe('StuckTable', () => {
  it('lists the most overdue first by default', async () => {
    const { wrapper } = await mountTable();
    expect(orderIds(wrapper)).toEqual(['ord_b', 'ord_c', 'ord_a']);
    expect(wrapper.find('th[aria-sort=descending]').text()).toContain('Overdue by');
  });

  it('sorts by a column and toggles direction', async () => {
    const { wrapper } = await mountTable();
    await wrapper.find('[data-sort=daysWaiting]').trigger('click');
    expect(orderIds(wrapper)).toEqual(['ord_c', 'ord_a', 'ord_b']);
    await wrapper.find('[data-sort=daysWaiting]').trigger('click');
    expect(orderIds(wrapper)).toEqual(['ord_b', 'ord_a', 'ord_c']);
    await wrapper.find('[data-sort=orderId]').trigger('click');
    expect(orderIds(wrapper)).toEqual(['ord_a', 'ord_b', 'ord_c']);
  });

  it('paginates', async () => {
    const { wrapper } = await mountTable(2);
    expect(wrapper.findAll('[data-testid=stuck-row]')).toHaveLength(2);
    expect(wrapper.text()).toContain('1–2 of 3');
  });

  it('opens the order when a row is clicked', async () => {
    const { wrapper, router } = await mountTable();
    await wrapper.findAll('[data-testid=stuck-row]')[0]?.trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.fullPath).toBe('/orders/ord_b');
  });
});
