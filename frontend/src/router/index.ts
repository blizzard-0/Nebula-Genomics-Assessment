import { createRouter, createWebHistory } from 'vue-router';
import OverviewView from '@/views/OverviewView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'overview', component: OverviewView, meta: { title: 'Overview' } },
    {
      path: '/turnaround',
      name: 'turnaround',
      component: () => import('@/views/TurnaroundView.vue'),
      meta: { title: 'Turnaround' },
    },
    {
      path: '/stuck',
      name: 'stuck',
      component: () => import('@/views/StuckView.vue'),
      meta: { title: 'Stuck kits' },
    },
    {
      path: '/orders/:id',
      name: 'order',
      component: () => import('@/views/OrderView.vue'),
      props: true,
      meta: { title: 'Order' },
    },
    {
      path: '/data',
      name: 'data',
      component: () => import('@/views/DataView.vue'),
      meta: { title: 'Data' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
      meta: { title: 'Not found' },
    },
  ],
  scrollBehavior(to, from) {
    // Filter changes keep the scroll position; page changes start at the top.
    if (to.path === from.path) return false;
    return { top: 0 };
  },
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  const id = typeof to.params.id === 'string' ? ` ${to.params.id}` : '';
  document.title = title ? `${title}${id} · Kit Lifecycle Dashboard` : 'Kit Lifecycle Dashboard';
});
