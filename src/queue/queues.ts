import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { CrmRef } from '../bitrix/crm.js';
import type { OutboundFile } from '../types.js';
import type { InboundJob } from '../whatsapp/jobs.js';

/** Operator reply from Contact Center (ONIMCONNECTORMESSAGEADD). */
export interface OutboundJob {
  portalId: string;
  lineId: number;
  chatId: string;
  bitrixChatId: number;
  bitrixMessageId: number;
  text: string;
  files: OutboundFile[];
}

/** Message the business sends from CRM: robot, SMS provider, or the CRM tab. */
export interface CrmSendJob {
  portalId: string;
  source: 'robot' | 'sms' | 'tab';
  /** explicit number id, or a label / phone typed in a robot, or empty for the portal default */
  numberId?: string | null;
  from?: string | null;
  phone: string;
  text: string;
  fileUrl?: string | null;
  ref?: CrmRef | null;
  /** idempotency key: SMS message id or robot event token */
  extRef: string;
  smsMessageId?: string | null;
}

export const QUEUES = { inbound: 'wa-inbound', outbound: 'wa-outbound', crm: 'wa-crm' } as const;

const connection = () => ({ url: config().redisUrl, maxRetriesPerRequest: null });

const defaultJobOptions = {
  attempts: 6,
  backoff: { type: 'exponential' as const, delay: 3000 },
  removeOnComplete: { count: 2000 },
  removeOnFail: { count: 5000 },
};

let inboundQ: Queue<InboundJob> | null = null;
let outboundQ: Queue<OutboundJob> | null = null;
let crmQ: Queue<CrmSendJob> | null = null;

export const inboundQueue = () => (inboundQ ??= new Queue<InboundJob>(QUEUES.inbound, { connection: connection(), defaultJobOptions }));
export const outboundQueue = () => (outboundQ ??= new Queue<OutboundJob>(QUEUES.outbound, { connection: connection(), defaultJobOptions }));
export const crmQueue = () => (crmQ ??= new Queue<CrmSendJob>(QUEUES.crm, { connection: connection(), defaultJobOptions }));

export interface Processors {
  inbound(job: Job<InboundJob>): Promise<void>;
  outbound(job: Job<OutboundJob>): Promise<void>;
  crm(job: Job<CrmSendJob>): Promise<void>;
  /** All retries used up: tell a human. */
  onGaveUp(queue: string, job: Job, err: Error): Promise<void>;
}

export function startWorkers(p: Processors): Worker[] {
  const make = <T>(name: string, fn: (job: Job<T>) => Promise<void>) => {
    const worker = new Worker<T>(name, fn, { connection: connection(), concurrency: 8 });
    worker.on('failed', (job, err) => {
      if (!job) return;
      const final = job.attemptsMade >= (job.opts.attempts ?? 1);
      logger.warn({ queue: name, jobId: job.id, attempts: job.attemptsMade, final, err: err.message }, 'job failed');
      if (final) void p.onGaveUp(name, job, err).catch((e) => logger.error({ err: e }, 'gave-up handler failed'));
    });
    worker.on('error', (err) => logger.error({ queue: name, err }, 'worker error'));
    return worker;
  };
  return [
    make(QUEUES.inbound, p.inbound),
    make(QUEUES.outbound, p.outbound),
    make(QUEUES.crm, p.crm),
  ];
}

export async function closeQueues(): Promise<void> {
  await Promise.all([inboundQ?.close(), outboundQ?.close(), crmQ?.close()]);
}
