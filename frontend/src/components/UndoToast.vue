<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { ref } from 'vue';
import { useDatasetStore } from '@/stores/dataset';

const store = useDatasetStore();
const failed = ref(false);

async function undo(): Promise<void> {
  failed.value = false;
  try {
    await store.undoRemove();
  } catch {
    failed.value = true;
  }
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    aria-live="polite"
  >
    <div
      v-if="store.lastRemoved"
      class="pointer-events-auto flex items-center gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg"
      data-testid="undo-toast"
    >
      <span>
        Removed "{{ store.lastRemoved.meta.name }}".
        <span v-if="failed" class="text-warn-soft">It couldn't be restored.</span>
      </span>
      <button
        type="button"
        class="rounded px-1.5 py-0.5 font-semibold text-accent-soft underline underline-offset-2 hover:text-white"
        @click="undo"
      >
        Undo
      </button>
      <button
        type="button"
        class="rounded p-0.5 text-white/70 hover:text-white"
        aria-label="Dismiss"
        @click="store.dismissUndo()"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
