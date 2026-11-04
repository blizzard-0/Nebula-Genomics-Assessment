/**
 * Each dataset gets its own color, so you can tell at a glance which one is open: the same
 * color appears in the header, the banner on every page and the dataset list.
 */
export const SAMPLE_COLOR = '#3b2fc9';

const PALETTE = [
  '#0f766e',
  '#b45309',
  '#be185d',
  '#0369a1',
  '#475569',
  '#4d7c0f',
  '#c2410c',
  '#0e7490',
];

export function datasetColor(id: string): string {
  if (id === 'sample') return SAMPLE_COLOR;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? SAMPLE_COLOR;
}

export function datasetKindLabel(kind: 'sample' | 'saved' | 'unsaved'): string {
  if (kind === 'sample') return 'Sample data';
  if (kind === 'unsaved') return 'Your upload, not saved';
  return 'Your upload';
}
