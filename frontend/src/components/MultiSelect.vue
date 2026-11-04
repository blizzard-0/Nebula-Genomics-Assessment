<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import { Check, ChevronDown } from 'lucide-vue-next';
import { computed, ref, useId } from 'vue';

const props = defineProps<{
  label: string;
  options: readonly { value: string; label: string }[];
  modelValue: readonly string[];
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const id = useId();

onClickOutside(root, () => {
  open.value = false;
});

const summary = computed(() => {
  const selected = props.options.filter((o) => props.modelValue.includes(o.value));
  if (selected.length === 0) return 'All';
  if (selected.length <= 2) return selected.map((o) => o.label).join(', ');
  return `${selected.length} selected`;
});

function toggle(value: string): void {
  const set = new Set(props.modelValue);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  // Keep option order stable in the URL.
  emit(
    'update:modelValue',
    props.options.map((o) => o.value).filter((v) => set.has(v)),
  );
}
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="field flex w-full items-center gap-2 text-left sm:w-auto"
      :aria-expanded="open"
      :aria-controls="id"
      @click="open = !open"
    >
      <span class="text-muted">{{ label }}</span>
      <span class="max-w-40 truncate font-medium" :class="modelValue.length ? 'text-accent' : ''">
        {{ summary }}
      </span>
      <ChevronDown class="ml-auto size-4 text-muted" aria-hidden="true" />
    </button>
    <div
      v-show="open"
      :id="id"
      class="absolute z-30 mt-1 max-h-72 min-w-48 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg"
      role="group"
      :aria-label="label"
    >
      <label
        v-for="opt in options"
        :key="opt.value"
        class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-paper"
      >
        <input
          type="checkbox"
          class="peer sr-only"
          :checked="modelValue.includes(opt.value)"
          @change="toggle(opt.value)"
        />
        <span
          class="flex size-4 items-center justify-center rounded border border-line-strong peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
          aria-hidden="true"
        >
          <Check v-if="modelValue.includes(opt.value)" class="size-3 text-white" />
        </span>
        {{ opt.label }}
      </label>
      <button
        v-if="modelValue.length"
        type="button"
        class="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-paper"
        @click="emit('update:modelValue', [])"
      >
        Clear
      </button>
    </div>
  </div>
</template>
