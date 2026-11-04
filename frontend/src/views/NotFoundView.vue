<script setup lang="ts">
import StateBlock from '@/components/StateBlock.vue';
</script>

<template>
  <StateBlock
    kind="empty"
    title="This page does not exist"
    message="The link may be mistyped. Use the navigation above, or search for an order id."
  >
    <RouterLink to="/" class="btn btn-primary">Go to the overview</RouterLink>
  </StateBlock>
</template>
