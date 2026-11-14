import type { Job } from 'bullmq';
import { call } from '../bitrix/client.js';
import { addTimelineComment } from '../bitrix/crm.js';
import { fetchPublicFile, mediaKindFor } from '../bitrix/files.js';
import { SMS_PROVIDER_CODE } from '../bitrix/registration.js';
import { findChat } from '../db/chats.js';
import { claim, markFailed, markSent } from '../db/messages.js';
import { listNumbers } from '../db/numbers.js';
import { getPortalById } from '../db/portals.js';
import { logger } from '../logger.js';
import type { CrmSendJob } from '../queue/queues.js';
import type { Portal, WaNumber } from '../types.js';
import { digitsOnly, normalizePhone } from '../util/phone.js';
import { getEngine } from '../whatsapp/instance.js';
import { ensureChat, postNote } from './openlines.js';

const SOURCE_LABEL: Record<CrmSendJob['source'], string> = {
  robot: 'automation rule',
  sms: 'CRM message',
  tab: 'CRM',
};

/** Which linked number sends: explicit id > robot "from" (label or phone) > portal default > first connected. */
export function pickNumber(numbers: WaNumber[], job: Pick<CrmSendJob, 'numberId' | 'from'>, defaultId: string | null): WaNumber | null {
  if (job.numberId) return numbers.find((n) => n.id === job.numberId) ?? null;
  const from = job.from?.trim();
  if (from) {
    const digits = digitsOnly(from);
    const hit = numbers.find((n) => n.label.toLowerCase() === from.toLowerCase() || (digits.length >= 6 && n.phone === digits));
    if (hit) return hit;
  }
  if (defaultId) {
    const def = numbers.find((n) => n.id === defaultId);
    if (def) return def;
  }
  return numbers.find((n) => n.status === 'connected') ?? numbers[0] ?? null;
}

export class PermanentError extends Error {}

export async function processCrmSend(job: Job<CrmSendJob>): Promise<void> {
  const data = job.data;
  const portal = await getPortalById(data.portalId);
  if (!portal || portal.status !== 'active') return;

  const number = pickNumber(await listNumbers(portal.id), data, portal.default_number_id);
  if (!number) return reportFailure(portal, data, 'No WhatsApp number is connected in the WhatsApp app.');

  const phone = normalizePhone(data.phone);
  if (!phone) return reportFailure(portal, data, `"${data.phone}" is not a valid phone number.`);

  const c = await claim(number.id, 'crm_out', { extRef: data.extRef });
  if (!c.proceed) return;

  const engine = getEngine();
  // Throws NOT_CONNECTED while the number is offline -> queue retries with backoff.
  const jid = await engine.lookup(number.id, phone);
  if (!jid) {
    await markFailed(c.row.id, 'NOT_ON_WHATSAPP');
    return reportFailure(portal, data, `+${phone} is not on WhatsApp.`);
  }

  let waId: string;
  if (data.fileUrl) {
    const file = await fetchPublicFile(data.fileUrl);
    const name = decodeURIComponent(new URL(data.fileUrl).pathname.split('/').pop() || 'file');
    const kind = mediaKindFor(name, file.mime);
    waId = await engine.sendMedia(number.id, jid, {
      kind,
      data: file.data,
      mime: file.mime,
      fileName: name,
      caption: kind === 'audio' ? undefined : data.text || undefined,
    });
    if (kind === 'audio' && data.text) waId = await engine.sendText(number.id, jid, data.text);
  } else {
    waId = await engine.sendText(number.id, jid, data.text);
  }
  await markSent(c.row.id, waId, { source: data.source, smsMessageId: data.smsMessageId ?? null, ref: data.ref ?? null });

  // Everything below is reporting: it must never turn a sent message into a retry (= duplicate).
  await mirrorIntoChat(portal, number, phone, data).catch((err) =>
    logger.warn({ err: (err as Error).message }, 'could not mirror CRM send into the Open Line chat'),
  );
  if (data.source === 'robot' && data.ref) {
    await addTimelineComment(
      portal,
      data.ref,
      `WhatsApp message sent to +${phone}${number.phone ? ` from +${number.phone}` : ''}:\n${data.text}`,
    ).catch(() => undefined);
  }
}

async function mirrorIntoChat(portal: Portal, number: WaNumber, phone: string, data: CrmSendJob) {
  if (!number.line_id) return;
  const existing = await findChat(number.id, phone);
  const chat = await ensureChat(portal, { ...number, line_id: number.line_id }, phone, null, existing);
  if (chat.bitrix_chat_id) {
    await postNote(portal, chat.bitrix_chat_id, `📤 Sent from ${SOURCE_LABEL[data.source]}:\n${data.text}${data.fileUrl ? `\n${data.fileUrl}` : ''}`);
  }
}

/** Surface a failure where the user who triggered it will look. */
export async function reportFailure(portal: Portal, data: CrmSendJob, reason: string): Promise<void> {
  logger.warn({ source: data.source, reason }, 'CRM WhatsApp send failed');
  if (data.source === 'sms' && data.smsMessageId) {
    await setSmsStatus(portal, data.smsMessageId, 'failed').catch(() => undefined);
  }
  if (data.ref) {
    await addTimelineComment(portal, data.ref, `⚠️ WhatsApp message to ${data.phone} was not sent: ${reason}`).catch(() => undefined);
  }
}

export async function setSmsStatus(portal: Portal, messageId: string, status: 'delivered' | 'failed' | 'undelivered') {
  await call(portal, 'messageservice.message.status.update', { CODE: SMS_PROVIDER_CODE, MESSAGE_ID: messageId, STATUS: status });
}
