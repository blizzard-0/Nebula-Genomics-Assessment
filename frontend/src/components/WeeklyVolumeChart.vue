<script setup lang="ts">
import type { ChartData, ChartOptions } from 'chart.js';
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import '@/lib/chart';
import { fmtShortDate, productLabel } from '@/lib/format';
import type { WeeklySeries } from '@/lib/metrics';
import { productColor } from '@/lib/palette';

const props = defineProps<{ volume: WeeklySeries }>();

const data = computed<ChartData<'bar'>>(() => ({
  labels: props.volume.weeks.map(fmtShortDate),
  datasets: props.volume.series.map((s, i) => ({
    label: productLabel(s.product),
    data: s.counts,
    backgroundColor: productColor(s.product, i),
    borderRadius: 2,
    barPercentage: 0.85,
    categoryPercentage: 0.9,
  })),
}));

const options: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  scales: {
    x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
    y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
  },
  plugins: {
    legend: { position: 'bottom', align: 'start' },
    tooltip: {
      callbacks: { title: (items) => `Week of ${items[0]?.label ?? ''}` },
    },
  },
};

const summary = computed(() => {
  const totals = props.volume.series.map(
    (s) => `${productLabel(s.product)} ${s.counts.reduce((a, b) => a + b, 0)}`,
  );
  return `Orders per week over ${props.volume.weeks.length} weeks: ${totals.join(', ')}.`;
});
</script>

<template>
  <div class="relative h-64">
    <Bar :data="data" :options="options" role="img" :aria-label="summary" />
  </div>
</template>
