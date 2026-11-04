import { Router } from 'express';
import type { HealthResponse } from '../contracts.js';
import { ENGINE_VERSION } from '../contracts.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const body: HealthResponse = { status: 'ok', engineVersion: ENGINE_VERSION };
  res.set('Cache-Control', 'no-store');
  res.json(body);
});
