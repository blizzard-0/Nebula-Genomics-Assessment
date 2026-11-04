/** Chart colors, mirrored from the CSS tokens in assets/main.css. */
export const COLORS = {
  ink: '#1d1b4b',
  muted: '#6b6a8a',
  line: '#e1e3ef',
  accent: '#3b2fc9',
  ok: '#0f766e',
  warn: '#d58a1f',
  bad: '#b4233c',
} as const;

const PRODUCT_COLORS: Record<string, string> = {
  wgs_30x: '#3b2fc9',
  wgs_100x: '#8f7ff0',
  upload_only: '#c3c6dc',
};

const FALLBACK = ['#5d6bb0', '#a3a9cf', '#7c7a9c'];

export function productColor(product: string, i = 0): string {
  return PRODUCT_COLORS[product] ?? FALLBACK[i % FALLBACK.length] ?? COLORS.muted;
}
