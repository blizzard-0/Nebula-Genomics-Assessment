<script setup lang="ts">
import type { Severity } from '@contracts';
import Badge from './Badge.vue';

defineProps<{ severity: Severity }>();
</script>

<template>
  <Badge :tone="severity === 'critical' ? 'bad' : 'warn'">
    <span
      class="size-1.5 rounded-full"
      :class="severity === 'critical' ? 'bg-bad' : 'bg-warn'"
      aria-hidden="true"
    />
    {{ severity === 'critical' ? 'Critical' : 'Overdue' }}
  </Badge>
</template>
