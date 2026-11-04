<script setup lang="ts">
import { AlertTriangle, Inbox, LoaderCircle } from 'lucide-vue-next';

defineProps<{
  kind: 'loading' | 'error' | 'empty';
  title: string;
  message?: string;
}>();
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    :role="kind === 'error' ? 'alert' : 'status'"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
  >
    <LoaderCircle
      v-if="kind === 'loading'"
      class="size-7 animate-spin text-accent"
      aria-hidden="true"
    />
    <AlertTriangle v-else-if="kind === 'error'" class="size-7 text-bad" aria-hidden="true" />
    <Inbox v-else class="size-7 text-muted" aria-hidden="true" />
    <p class="text-base font-semibold">{{ title }}</p>
    <p v-if="message" class="max-w-md text-sm text-muted">{{ message }}</p>
    <div v-if="$slots.default" class="mt-2 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
