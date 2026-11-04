import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { COLORS } from './palette';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

Chart.defaults.font.family = "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = COLORS.muted;
Chart.defaults.borderColor = COLORS.line;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.plugins.tooltip.backgroundColor = COLORS.ink;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 6;
// Merge into the animation defaults (replacing the object would drop its easing function).
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
Chart.defaults.set('animation', { duration: reducedMotion ? 0 : 250 });

export { Chart };
