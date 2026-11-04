import { Router } from 'express';
import { analyzeFiles } from '../domain/buildDataset.js';
import { loadSample } from '../domain/sample.js';
import { parseTimestamp } from '../domain/time.js';
import { HttpError } from '../middleware/errors.js';
import { csvUpload, MAX_UPLOAD_BYTES } from '../middleware/upload.js';

export const datasetsRouter = Router();

datasetsRouter.get('/sample', (_req, res) => {
  const { json } = loadSample();
  res.set('Cache-Control', 'public, max-age=300, s-maxage=86400');
  res.type('application/json').send(json);
});

datasetsRouter.post('/analyze', csvUpload.any(), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'file_too_large', 'Together the two files must be 4 MB or smaller.');
  }
  const body = req.body as Record<string, unknown> | undefined;
  const asOfRaw = typeof body?.asOf === 'string' ? body.asOf.trim() : '';
  let asOf: number | undefined;
  if (asOfRaw) {
    const parsed = parseTimestamp(asOfRaw);
    if (!parsed) {
      throw new HttpError(
        400,
        'invalid_as_of',
        `The as-of date "${asOfRaw}" is not a valid date (use YYYY-MM-DD).`,
      );
    }
    // A bare date means 00:00 UTC that day, matching how the brief dates the sample export.
    asOf = parsed.ms;
  }
  const dataset = analyzeFiles(
    files.map((f) => ({ name: f.originalname || f.fieldname, content: f.buffer })),
    {
      source: 'upload',
      label: files.map((f) => f.originalname).join(' + '),
      ...(asOf !== undefined ? { asOf, asOfSource: 'override' as const } : {}),
    },
  );
  res.set('Cache-Control', 'no-store');
  res.json(dataset);
});
