<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { isLoading } from '@/lib/loading';

/**
 * Thin bar at the top of the window while anything is loading. It creeps towards 90 % while
 * work is running, then fills and fades out, and stays visible for at least a moment so even
 * quick actions give feedback.
 */
const MIN_VISIBLE_MS = 300;

const width = ref(0);
const visible = ref(false);
let shownAt = 0;
let trickle: ReturnType<typeof setInterval> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function start(): void {
  clearTimeout(hideTimer);
  if (!visible.value) {
    visible.value = true;
    width.value = 12;
    shownAt = Date.now();
  }
  clearInterval(trickle);
  trickle = setInterval(() => {
    width.value = Math.min(90, width.value + (90 - width.value) * 0.12);
  }, 150);
}

function finish(): void {
  clearInterval(trickle);
  const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt));
  hideTimer = setTimeout(() => {
    width.value = 100;
    hideTimer = setTimeout(() => {
      visible.value = false;
      width.value = 0;
    }, 250);
  }, wait);
}

watch(
  isLoading,
  (loading) => {
    if (loading) start();
    else if (visible.value) finish();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearInterval(trickle);
  clearTimeout(hideTimer);
});
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"
    role="progressbar"
    aria-label="Loading"
    :aria-hidden="!visible"
    :aria-valuenow="Math.round(width)"
    aria-valuemin="0"
    aria-valuemax="100"
    data-testid="top-progress"
    :data-active="visible"
  >
    <div
      class="h-full bg-accent shadow-[0_0_8px_var(--color-accent)] transition-[width,opacity] duration-200 ease-out"
      :style="{ width: `${width}%`, opacity: visible ? 1 : 0 }"
    />
  </div>
</template>
