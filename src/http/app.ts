import { Hono } from 'hono';
import { logger } from '../logger.js';
import { apiRoutes } from './routes/api.js';
import { automationRoutes } from './routes/automation.js';
import { eventRoutes } from './routes/events.js';
import { frameRoutes } from './routes/frames.js';
import { mediaRoutes } from './routes/media.js';

export function createApp() {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true }));
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
