const intFmt = new Intl.NumberFormat('en-US');
const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const pctFmt = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const shortDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

export const DASH = '–';

export const fmtInt = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : intFmt.format(n);

export const fmtDays = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : `${oneDecimal.format(n)} d`;

export const fmtNum1 = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : oneDecimal.format(n);

export const fmtPct = (n: number | null | undefined): string =>
  n === null || n === undefined ? DASH : pctFmt.format(n);

export const fmtDate = (ms: number | null | undefined): string =>
  ms === null || ms === undefined ? DASH : dateFmt.format(ms);

export const fmtShortDate = (ms: number): string => shortDateFmt.format(ms);

export const fmtDateTime = (ms: number | null | undefined): string =>
  ms === null || ms === undefined ? DASH : `${dateTimeFmt.format(ms).replace(',', '')} UTC`;

/** YYYY-MM-DD in UTC, used by date inputs and URL parameters. */
export const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const PRODUCT_LABEL: Record<string, string> = {
  wgs_30x: 'WGS 30x',
  wgs_100x: 'WGS 100x',
  upload_only: 'Upload only',
};

export const productLabel = (p: string): string => PRODUCT_LABEL[p] ?? p;

export const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

export const EVENT_LABEL: Record<string, string> = {
  kit_shipped: 'Kit shipped',
  kit_delivered: 'Delivered to customer',
  sample_mailed: 'Sample mailed',
  sample_received: 'Received at lab',
  qc_passed: 'QC passed',
  qc_failed: 'QC failed',
  sequencing_complete: 'Sequencing complete',
  report_ready: 'Report ready',
  kit_replaced: 'Kit replaced',
};

export const eventLabel = (t: string): string => EVENT_LABEL[t] ?? t;
