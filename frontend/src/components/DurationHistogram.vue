<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js';
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import '@/lib/chart';
import { fmtInt } from '@/lib/format';
import { COLORS } from '@/lib/palette';
import { histogram, niceBinWidth, quantile } from '@/lib/stats';

const props = defineProps<{ values: number[]; targetDays: number; label: string }>();

const bins = computed(() => {
  // Show up to the 98th percentile (or a bit past target); the rest lands in the last bin.
  const p98 = quantile(props.values, 0.98) ?? props.targetDays;
  const max = Math.max(props.targetDays * 1.25, p98);
  const width = niceBinWidth(max);
  return histogram(props.values, width, Math.ceil(max / width) * width);
});

const fmtEdge = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

const data = computed<ChartData<'bar'>>(() => ({
  labels: bins.value.map((b) =>
    b.to === Infinity ? `${fmtEdge(b.from)}+` : `${fmtEdge(b.from)}–${fmtEdge(b.to)}`,
  ),
  datasets: [
    {
      label: 'Kits',
      data: bins.value.map((b) => b.count),
      backgroundColor: bins.value.map((b) =>
        b.to <= props.targetDays
          ? COLORS.accent
          : b.from >= props.targetDays * 2
            ? COLORS.bad
            : COLORS.warn,
      ),
      borderRadius: 1,
      barPercentage: 1,
      categoryPercentage: 0.92,
    },
  ],
}));

const options: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      grid: { display: false },
      title: { display: true, text: 'Days in stage' },
      ticks: { maxRotation: 0, autoSkipPadding: 8 },
    },
    y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Kits' } },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items) => `${items[0]?.label ?? ''} days`,
        label: (item) => ` ${fmtInt(item.parsed.y)} kits`,
      },
    },
  },
};

const over = computed(() => props.values.filter((v) => v > props.targetDays).length);
const summary = computed(
  () =>
    `Distribution of ${props.label} durations: ${fmtInt(props.values.length)} kits, ${fmtInt(over.value)} over the ${props.targetDays}-day target.`,
);
</script>

<template>
  <div class="relative h-64">
    <Bar :data="data" :options="options" role="img" :aria-label="summary" />
  </div>
</template>
