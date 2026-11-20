import { Hono } from 'hono';
import { one } from '../db/pool.js';
import { logger } from '../logger.js';
import { inboundQueue } from '../queue/queues.js';
import { apiRoutes } from './routes/api.js';
import { automationRoutes } from './routes/automation.js';
import { billingRoutes } from './routes/billing.js';
import { legalRoutes } from './routes/legal.js';
import { eventRoutes } from './routes/events.js';
import { frameRoutes } from './routes/frames.js';
import { mediaRoutes } from './routes/media.js';

export function createApp() {
  const app = new Hono();

  // Access log (method, path, status, time). Never query strings or bodies: they carry tokens.
  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === '/health') return next();
    const t0 = Date.now();
    await next();
    logger.info({ method: c.req.method, path, status: c.res.status, ms: Date.now() - t0 }, 'request');
  });

  // Light check for Docker. `?deep=1` also proves PostgreSQL and Redis answer - use it for uptime monitors.
  app.get('/health', async (c) => {
    if (c.req.query('deep') === undefined) return c.json({ ok: true });
    const checks = { db: false, redis: false };
    await one('SELECT 1').then(() => (checks.db = true), () => undefined);
    await inboundQueue()
      .getJobCounts('waiting')
      .then(() => (checks.redis = true), () => undefined);
    const ok = checks.db && checks.redis;
    return c.json({ ok, ...checks }, ok ? 200 : 503);
  });
  app.route('/', billingRoutes);
  app.route('/', legalRoutes);
  app.route('/', eventRoutes);
  app.route('/', automationRoutes);
  app.route('/', apiRoutes);
  app.route('/', mediaRoutes);
  app.route('/', frameRoutes); // owns "/" - mounted last

  app.onError((err, c) => {
    // Details go to the log only - never to the caller.
    logger.error({ path: new URL(c.req.url).pathname, err }, 'unhandled error');
    return c.json({ error: 'SERVER_ERROR', message: 'Something went wrong. Try again.' }, 500);
  });
  return app;
}
