import { computed, ref } from 'vue';

/**
 * App-wide loading state behind the top progress bar. Anything that makes the user wait
 * (navigation, API calls, browser storage, downloads) registers itself here.
 */
const pending = ref(0);

export const isLoading = computed(() => pending.value > 0);

/** Marks the start of some work. Call the returned function once when it is done. */
export function startLoading(): () => void {
  pending.value++;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    pending.value = Math.max(0, pending.value - 1);
  };
}

/** Runs `work` while the loading state is on. */
export async function track<T>(work: () => Promise<T>): Promise<T> {
  const stop = startLoading();
  try {
    return await work();
  } finally {
    stop();
  }
}

/** Resolves after the browser has painted, so a spinner shows before blocking work starts. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Test helper. */
export function resetLoading(): void {
  pending.value = 0;
}
