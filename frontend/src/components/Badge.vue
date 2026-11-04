<script setup lang="ts">
export type BadgeTone = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'neutral';

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: 'neutral' });

const TONES: Record<BadgeTone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-paper text-ink-soft ring-1 ring-line ring-inset',
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    :class="TONES[tone]"
  >
    <slot />
  </span>
</template>
