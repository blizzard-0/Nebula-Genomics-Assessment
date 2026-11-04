import { createRouter, createWebHistory } from 'vue-router';
import { nextFrame, startLoading } from '@/lib/loading';
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

// Every navigation, including filter changes that only touch the query string, shows the
// top progress bar. Waiting one frame lets the bar paint before the next page renders.
let stopNavigation: (() => void) | null = null;

router.beforeEach(async (to, from) => {
  if (to.fullPath === from.fullPath) return;
  stopNavigation?.();
  stopNavigation = startLoading();
  await nextFrame();
});

router.afterEach(() => {
  stopNavigation?.();
  stopNavigation = null;
});

// After a new deploy, an open tab may ask for page chunks that no longer exist.
// Loading the requested URL fresh picks up the new version.
router.onError((err, to) => {
  stopNavigation?.();
  stopNavigation = null;
  const message = err instanceof Error ? err.message : String(err);
  if (/dynamically imported module|Importing a module script failed/i.test(message)) {
    window.location.assign(to.fullPath);
  }
});
