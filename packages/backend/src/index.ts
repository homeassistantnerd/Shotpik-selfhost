import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { clientRouter } from './routes/client.js';
import { adminRouter } from './routes/admin.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

// Configure core middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Healthcheck endpoint
app.get('/api/health', (_req, res) => {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount modular API routers
app.use('/api/client', clientRouter);
app.use('/api/admin', adminRouter);

/**
 * Resolves the production static frontend build output directory.
 */
function resolveFrontendDist(): string | null {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    process.env.FRONTEND_DIST_PATH,
    path.resolve(process.cwd(), 'packages/frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(currentDir, '../../../frontend/dist'),
    path.resolve(currentDir, '../../../../packages/frontend/dist'),
  ];

  for (const candidate of candidatePaths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

const frontendDistPath = resolveFrontendDist();

if (frontendDistPath) {
  console.log(`[Server] Serving frontend static assets from: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));

  // Route non-/api GET requests to frontend SPA index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexFile = path.join(frontendDistPath, 'index.html');
    if (fs.existsSync(indexFile)) {
      return res.sendFile(indexFile);
    }
    return next();
  });
} else {
  console.log('[Server] Frontend dist directory not found. Running in API-only mode.');
}

const server = app.listen(port, () => {
  console.log(`[Server] Shotpik Backend API running on port ${port}`);
});

export { app, server };
export default app;
