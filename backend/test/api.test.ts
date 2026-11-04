import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ApiError, Dataset } from '../src/contracts.js';
import { ENGINE_VERSION } from '../src/contracts.js';
import { eventsCsv, ordersCsv } from './helpers.js';

const app = createApp();

const orders = Buffer.from(ordersCsv([{ id: 'o1', created: '2026-09-01T00:00:00Z' }]));
const events = Buffer.from(
  eventsCsv([
    ['o1', 'k1', 'kit_shipped', '2026-09-02T00:00:00Z'],
    ['o1', 'k1', 'kit_delivered', '2026-09-04T00:00:00Z'],
  ]),
);

describe('API', () => {
  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', engineVersion: ENGINE_VERSION });
  });

  it('GET /api/datasets/sample returns the cached sample dataset', async () => {
    const res = await request(app).get('/api/datasets/sample');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age');
    const body = res.body as Dataset;
    expect(body.meta.source).toBe('sample');
    expect(body.orders).toHaveLength(5000);
    expect(body.stages).toHaveLength(7);
  });

  it('POST /api/datasets/analyze accepts the files in either order', async () => {
    for (const [a, b] of [
      [
        { buf: orders, name: 'orders.csv' },
        { buf: events, name: 'kit_events.csv' },
      ],
      [
        { buf: events, name: 'kit_events.csv' },
        { buf: orders, name: 'orders.csv' },
      ],
    ] as const) {
      const res = await request(app)
        .post('/api/datasets/analyze')
        .attach('file1', a.buf, a.name)
        .attach('file2', b.buf, b.name);
      expect(res.status).toBe(200);
      const body = res.body as Dataset;
      expect(body.meta.source).toBe('upload');
      expect(body.meta.asOfSource).toBe('latest_timestamp');
      expect(body.meta.asOf).toBe(Date.parse('2026-09-04T00:00:00Z'));
      expect(body.orders[0]?.position).toBe('customer');
    }
  });

  it('honours an as-of override', async () => {
    const res = await request(app)
      .post('/api/datasets/analyze')
      .field('asOf', '2026-10-20')
      .attach('files', orders, 'orders.csv')
      .attach('files', events, 'kit_events.csv');
    expect(res.status).toBe(200);
    expect((res.body as Dataset).meta).toMatchObject({
      asOf: Date.parse('2026-10-20T00:00:00Z'),
      asOfSource: 'override',
    });
  });

  it('rejects an invalid as-of', async () => {
    const res = await request(app)
      .post('/api/datasets/analyze')
      .field('asOf', 'next tuesday')
      .attach('files', orders, 'orders.csv')
      .attach('files', events, 'kit_events.csv');
    expect(res.status).toBe(400);
    expect((res.body as ApiError).error.code).toBe('invalid_as_of');
  });

  it('returns 400 with a clear message when a column is missing', async () => {
    const broken = Buffer.from(events.toString().replace('event_type', 'kind'));
    const res = await request(app)
      .post('/api/datasets/analyze')
      .attach('files', orders, 'orders.csv')
      .attach('files', broken, 'kit_events.csv');
    expect(res.status).toBe(400);
    const body = res.body as ApiError;
    expect(body.error.code).toBe('missing_columns');
    expect(body.error.message).toMatch(/kit_events\.csv.*event_type/);
  });

  it('returns 400 when the same file is uploaded twice', async () => {
    const res = await request(app)
      .post('/api/datasets/analyze')
      .attach('files', orders, 'orders.csv')
      .attach('files', orders, 'orders-copy.csv');
    expect(res.status).toBe(400);
    expect((res.body as ApiError).error.code).toBe('duplicate_file_type');
  });

  it('returns 400 when files are missing', async () => {
    const res = await request(app).post('/api/datasets/analyze');
    expect(res.status).toBe(400);
    expect((res.body as ApiError).error.code).toBe('wrong_file_count');
  });

  it('returns 413 when the upload is over 4 MB', async () => {
    const big = Buffer.alloc(4 * 1024 * 1024 + 10, 'a');
    const res = await request(app)
      .post('/api/datasets/analyze')
      .attach('files', big, 'orders.csv')
      .attach('files', events, 'kit_events.csv');
    expect(res.status).toBe(413);
    expect((res.body as ApiError).error.code).toBe('file_too_large');
  });

  it('returns 413 when two files together are over 4 MB', async () => {
    const half = Buffer.alloc(2.5 * 1024 * 1024, 'a');
    const res = await request(app)
      .post('/api/datasets/analyze')
      .attach('files', half, 'orders.csv')
      .attach('files', half, 'kit_events.csv');
    expect(res.status).toBe(413);
    expect((res.body as ApiError).error.message).toBe(
      'Together the two files must be 4 MB or smaller.',
    );
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect((res.body as ApiError).error.code).toBe('not_found');
  });
});
