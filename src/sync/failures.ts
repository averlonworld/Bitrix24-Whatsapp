import type { Job } from 'bullmq';
import { claim, markFailed } from '../db/messages.js';
import { getNumberByLine } from '../db/numbers.js';
import { getPortalById } from '../db/portals.js';
import { logger } from '../logger.js';
import { QUEUES, type CrmSendJob, type OutboundJob } from '../queue/queues.js';
import { reportFailure } from './crmSend.js';
import { postNote } from './openlines.js';

/** Every retry used up. Make it visible to a person instead of failing silently. */
export async function onGaveUp(queue: string, job: Job, err: Error): Promise<void> {
  const reason = err.message.slice(0, 300);
  if (queue === QUEUES.outbound) {
    const data = job.data as OutboundJob;
    const portal = await getPortalById(data.portalId);
    if (!portal) return;
    const number = await getNumberByLine(portal.id, data.lineId);
    if (number) {
      const c = await claim(number.id, 'out', { extRef: String(data.bitrixMessageId) });
      if (c.row.status === 'pending') await markFailed(c.row.id, reason);
    }
    await postNote(portal, data.bitrixChatId, `⚠️ This reply was not delivered to WhatsApp: ${reason}`).catch(() => undefined);
    return;
  }
  if (queue === QUEUES.crm) {
    const data = job.data as CrmSendJob;
    const portal = await getPortalById(data.portalId);
    if (portal) await reportFailure(portal, data, reason);
    return;
  }
  logger.error({ queue, jobId: job.id, reason }, 'inbound message could not be delivered to Bitrix24');
}
