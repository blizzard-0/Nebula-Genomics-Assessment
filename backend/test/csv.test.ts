import { describe, expect, it } from 'vitest';
import { analyzeFiles } from '../src/domain/buildDataset.js';
import { detectKind, parseCsv } from '../src/domain/csv.js';
import { HttpError } from '../src/middleware/errors.js';
import { EVENTS_HEADER, ORDERS_HEADER, eventsCsv, ordersCsv } from './helpers.js';

const opts = { source: 'upload' as const, label: 'test' };

function catchHttp(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw err;
  }
  throw new Error('expected an HttpError');
}

describe('parseCsv', () => {
  it('maps columns by header name in any order, with BOM, CRLF and extra columns', () => {
    const text =
      '﻿Status,extra,Order_ID,created_at,product\r\npaid,x,ord_1,2026-09-01T00:00:00Z,wgs_30x\r\n';
    const table = parseCsv(text);
    expect(table.header).toEqual(['status', 'extra', 'order_id', 'created_at', 'product']);
    expect(table.rows[0]).toMatchObject({ order_id: 'ord_1', status: 'paid', product: 'wgs_30x' });
  });

  it('rejects empty files', () => {
    expect(catchHttp(() => parseCsv('', 'a.csv')).code).toBe('empty_file');
    expect(catchHttp(() => parseCsv('﻿  \n', 'a.csv')).code).toBe('empty_file');
  });
});

describe('detectKind', () => {
  it('identifies each export by its header', () => {
    expect(detectKind(ORDERS_HEADER.split(','))).toBe('orders');
    expect(detectKind(EVENTS_HEADER.split(','))).toBe('events');
    expect(detectKind(['foo', 'bar'])).toBeNull();
  });

  it('still identifies a file that lost a column', () => {
    expect(detectKind(ORDERS_HEADER.replace(',status', '').split(','))).toBe('orders');
    expect(detectKind(EVENTS_HEADER.replace(',occurred_at', '').split(','))).toBe('events');
  });
});

describe('analyzeFiles', () => {
  const orders = ordersCsv([{ id: 'ord_1' }]);
  const events = eventsCsv([['ord_1', 'kit_1', 'kit_shipped', '2026-09-02T00:00:00Z']]);

  it('accepts the files in either order', () => {
    const a = analyzeFiles(
      [
        { name: 'orders.csv', content: orders },
        { name: 'events.csv', content: events },
      ],
      opts,
    );
    const b = analyzeFiles(
      [
        { name: 'events.csv', content: events },
        { name: 'orders.csv', content: orders },
      ],
      opts,
    );
    expect(a.orders).toEqual(b.orders);
    expect(a.kits).toHaveLength(1);
  });

  it('reports missing required columns clearly', () => {
    const broken = events.replace('occurred_at', 'when');
    const err = catchHttp(() =>
      analyzeFiles(
        [
          { name: 'orders.csv', content: orders },
          { name: 'events.csv', content: broken },
        ],
        opts,
      ),
    );
    expect(err.status).toBe(400);
    expect(err.code).toBe('missing_columns');
    expect(err.message).toContain('occurred_at');
    expect(err.message).toContain('events.csv');
  });

  it('rejects two files of the same type', () => {
    const err = catchHttp(() =>
      analyzeFiles(
        [
          { name: 'a.csv', content: orders },
          { name: 'b.csv', content: orders },
        ],
        opts,
      ),
    );
    expect(err.code).toBe('duplicate_file_type');
  });

  it('rejects unrecognized files and wrong file counts', () => {
    expect(
      catchHttp(() =>
        analyzeFiles(
          [
            { name: 'a.csv', content: 'x,y\n1,2' },
            { name: 'b.csv', content: orders },
          ],
          opts,
        ),
      ).code,
    ).toBe('unrecognized_file');
    expect(catchHttp(() => analyzeFiles([{ name: 'a.csv', content: orders }], opts)).code).toBe(
      'wrong_file_count',
    );
  });

  it('accepts is_test in any spelling', () => {
    const text = [
      ORDERS_HEADER,
      'o1,2026-09-01T00:00:00Z,c,wgs_30x,US,paid,TRUE',
      'o2,2026-09-01T00:00:00Z,c,wgs_30x,US,paid,1',
      'o3,2026-09-01T00:00:00Z,c,wgs_30x,US,paid,False',
      'o4,2026-09-01T00:00:00Z,c,wgs_30x,US,paid,0',
    ].join('\n');
    const ds = analyzeFiles(
      [
        { name: 'o.csv', content: text },
        { name: 'e.csv', content: EVENTS_HEADER },
      ],
      opts,
    );
    expect(ds.orders.map((o) => o.isTest)).toEqual([true, true, false, false]);
  });
});

describe('hostile files', () => {
  it('reads semicolon- and tab-delimited exports', () => {
    expect(parseCsv('order_id;created_at\no1;2026-09-01T00:00:00Z').rows[0]).toEqual({
      order_id: 'o1',
      created_at: '2026-09-01T00:00:00Z',
    });
    expect(parseCsv('order_id\tcreated_at\no1\t2026-09-01').rows[0]?.created_at).toBe('2026-09-01');
  });

  it('keeps commas inside quoted values', () => {
    expect(parseCsv('a,b\n"x, y",z').rows[0]).toEqual({ a: 'x, y', b: 'z' });
  });

  it('rejects binary content with a readable message', () => {
    const junk = Buffer.from(Array.from({ length: 512 }, (_, i) => (i * 37) % 256));
    const err = catchHttp(() => parseCsv(junk, 'orders.xlsx'));
    expect(err.code).toBe('not_text');
    expect(err.message).toBe(
      'orders.xlsx is not a text CSV file. Export it as CSV (UTF-8) and upload it again.',
    );
  });

  it('tolerates a few non-UTF-8 characters', () => {
    const latin1 = Buffer.from('order_id,customer_id\no1,Jos\xe9\n', 'latin1');
    expect(parseCsv(latin1).rows).toHaveLength(1);
  });
});
