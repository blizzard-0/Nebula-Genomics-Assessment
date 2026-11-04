<script setup lang="ts">
import type { ChartData, ChartOptions, Plugin } from 'chart.js';
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import '@/lib/chart';
import { fmtNum1, productLabel } from '@/lib/format';
import type { StageStat } from '@/lib/metrics';
import { COLORS, productColor } from '@/lib/palette';

const props = defineProps<{ stats: StageStat[]; products: string[] }>();

const data = computed<ChartData<'bar'>>(() => ({
  labels: props.stats.map((s) => s.label),
  datasets: props.products.map((p, i) => ({
    label: productLabel(p),
    data: props.stats.map((s) => s.byProduct[p]?.median ?? null),
    backgroundColor: productColor(p, i),
    borderRadius: 2,
    barPercentage: 0.9,
    categoryPercentage: 0.75,
  })),
}));

// Draws the stage target as a vertical tick across each stage's band.
const targetMarkers: Plugin<'bar'> = {
  id: 'targetMarkers',
  afterDatasetsDraw(chart) {
    const { ctx, scales } = chart;
    const x = scales.x;
    const y = scales.y;
    if (!x || !y) return;
    const band = (y.height / Math.max(1, props.stats.length)) * 0.42;
    ctx.save();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2;
    props.stats.forEach((s, i) => {
      const px = x.getPixelForValue(s.targetDays);
      const py = y.getPixelForValue(i);
      ctx.beginPath();
      ctx.moveTo(px, py - band);
      ctx.lineTo(px, py + band);
      ctx.stroke();
    });
    ctx.restore();
  },
};

const options = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y',
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      beginAtZero: true,
      suggestedMax: Math.max(...props.stats.map((s) => s.targetDays)) * 1.05,
      title: { display: true, text: 'Median days' },
    },
    y: { grid: { display: false } },
  },
  plugins: {
    legend: { position: 'bottom', align: 'start' },
    tooltip: {
      callbacks: {
        label: (item) => ` ${item.dataset.label}: ${fmtNum1(item.parsed.x)} d median`,
        afterBody: (items) => {
          const s = props.stats[items[0]?.dataIndex ?? 0];
          return s ? [`Target ${s.targetDays} d`] : [];
        },
      },
    },
  },
}));

const plugins = [targetMarkers];

const summary = computed(() =>
  props.stats
    .map(
      (s) =>
        `${s.label}: ${props.products
          .map((p) => `${productLabel(p)} ${fmtNum1(s.byProduct[p]?.median)} d`)
          .join(', ')}, target ${s.targetDays} d`,
    )
    .join('. '),
);
</script>

<template>
  <div class="relative h-80">
    <Bar :data="data" :options="options" :plugins="plugins" role="img" :aria-label="summary" />
  </div>
</template>
