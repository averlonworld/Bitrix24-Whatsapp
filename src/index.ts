import { serve } from '@hono/node-server';
import { config } from './config.js';
import { listAllNumbers } from './db/numbers.js';
import { migrate } from './db/migrate.js';
import { closeDb } from './db/pool.js';
import { createApp } from './http/app.js';
import { logger } from './logger.js';
import { cleanupMedia } from './media/store.js';
import { closeQueues, inboundQueue, startWorkers } from './queue/queues.js';
import { startAlertWatchdog } from './sync/alerts.js';
import { startRetention } from './sync/retention.js';
import { processCrmSend } from './sync/crmSend.js';
import { onGaveUp } from './sync/failures.js';
import { processInbound } from './sync/inbound.js';
import { processOutbound } from './sync/outbound.js';
import { handleReceipt } from './sync/receipts.js';
import { hasLinkedCreds } from './whatsapp/authState.js';
import { WhatsAppEngine } from './whatsapp/engine.js';
import { setEngine } from './whatsapp/instance.js';

async function main() {
  const cfg = config();
  await migrate();

  const engine = new WhatsAppEngine({
    // jobId = WhatsApp id: a message WhatsApp re-delivers is enqueued once.
    onInbound: async (job) => {
      const jobId = job.kind === 'message' ? `in-${job.numberId}-${job.waMessageId}` : `note-${job.numberId}-${job.eventId}`;
      await inboundQueue().add(job.kind, job, { jobId: jobId.replace(/[^a-zA-Z0-9_-]/g, '_') });
    },
    onReceipt: handleReceipt,
  });
  setEngine(engine);

  const workers = startWorkers({
    inbound: processInbound,
    outbound: processOutbound,
    crm: processCrmSend,
    onGaveUp,
  });

  const server = serve({ fetch: createApp().fetch, port: cfg.port }, (info) =>
    logger.info({ port: info.port, publicUrl: cfg.publicUrl }, 'HTTP server listening'),
  );

  // Reconnect every number that still holds a WhatsApp login.
  for (const n of await listAllNumbers()) {
    if (n.status === 'logged_out') continue;
    if (await hasLinkedCreds(n.id)) {
      engine.start(n.id).catch((err) => logger.error({ err, numberId: n.id }, 'could not start number'));
      await new Promise((r) => setTimeout(r, 500)); // stagger logins
    }
  }

  const cleanup = setInterval(() => void cleanupMedia().catch(() => undefined), 6 * 3600_000);
  void cleanupMedia().catch(() => undefined);
  const watchdog = startAlertWatchdog();
  const retention = startRetention();

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(cleanup);
    clearInterval(watchdog);
    clearInterval(retention);
    server.close();
    await Promise.allSettled(workers.map((w) => w.close()));
    await engine.shutdown();
    await closeQueues();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
