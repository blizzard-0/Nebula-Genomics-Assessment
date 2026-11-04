import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFound } from './middleware/errors.js';
import { datasetsRouter } from './routes/datasets.js';
import { healthRouter } from './routes/health.js';

export interface AppOptions {
  /** Absolute path of a built SPA to serve next to the API (prod-like local run). */
  staticDir?: string;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(
    helmet({
      // The SPA uses inline style attributes from the chart library.
      contentSecurityPolicy: {
        directives: {
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use('/health', healthRouter);
  api.use('/datasets', datasetsRouter);
  api.use(notFound);
  app.use('/api', api);

  if (options.staticDir) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    // SPA fallback so deep links such as /orders/:id survive a refresh.
    app.get('/{*splat}', (_req, res) => {
      res.sendFile('index.html', { root: staticDir });
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
