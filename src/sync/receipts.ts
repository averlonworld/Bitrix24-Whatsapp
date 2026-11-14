import { findOutgoingByWaId, markStatus } from '../db/messages.js';
import { getNumber } from '../db/numbers.js';
import { getPortalById } from '../db/portals.js';
import { logger } from '../logger.js';
import type { ReceiptEvent } from '../whatsapp/jobs.js';
import { confirmRead, type DeliveryRef } from './openlines.js';
import { setSmsStatus } from './crmSend.js';

/** WhatsApp delivery / read ticks -> Contact Center "read" and SMS-provider "delivered". */
export async function handleReceipt(event: ReceiptEvent): Promise<void> {
  const row = await findOutgoingByWaId(event.numberId, event.waMessageId);
  if (!row || row.status === 'read' || (row.status === 'delivered' && event.status === 'delivered')) return;
  const number = await getNumber(event.numberId);
  const portal = number ? await getPortalById(number.portal_id) : null;
  if (!portal) return;
  await markStatus(row.id, event.status);

  const meta = row.meta ?? {};
  try {
    if (row.direction === 'out' && event.status === 'read' && meta.bitrixMessageId) {
      await confirmRead(portal, meta as unknown as DeliveryRef, event.waMessageId);
    }
    if (row.direction === 'crm_out' && typeof meta.smsMessageId === 'string' && meta.smsMessageId) {
      await setSmsStatus(portal, meta.smsMessageId, 'delivered');
    }
  } catch (err) {
    logger.debug({ err: (err as Error).message }, 'receipt sync skipped');
  }
}
