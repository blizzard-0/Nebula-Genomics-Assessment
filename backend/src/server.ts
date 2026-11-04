import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const serveStatic = process.argv.includes('--static') || process.env.SERVE_STATIC === '1';
const staticDir = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));

if (serveStatic && !existsSync(staticDir)) {
  console.error(
    `SERVE_STATIC is on but ${staticDir} does not exist. Run "npm run build -w frontend".`,
  );
  process.exit(1);
}

const app = createApp(serveStatic ? { staticDir } : {});

app.listen(port, () => {
  const mode = serveStatic ? 'API + built frontend' : 'API only';
  console.log(`Nebula-Genomics-Assessment backend (${mode}) listening on http://localhost:${port}`);
});
