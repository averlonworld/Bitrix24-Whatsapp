import type { Job } from 'bullmq';
import { licenseOf, PAYMENT_REQUIRED_MESSAGE } from '../billing/license.js';
import { postNote } from './openlines.js';
import { fetchBitrixFile, mediaKindFor } from '../bitrix/files.js';
import { findChatByChatId } from '../db/chats.js';
import { claim, markFailed, markSent } from '../db/messages.js';
import { getNumberByLine } from '../db/numbers.js';
import { getPortalById } from '../db/portals.js';
import { logger } from '../logger.js';
import type { OutboundJob } from '../queue/queues.js';
import { bbcodeToWhatsApp } from '../util/format.js';
import { KeyedMutex } from '../util/keyedMutex.js';
import { isGroupJid, isLidJid, phoneFromJid } from '../util/phone.js';
import { getEngine } from '../whatsapp/instance.js';
import { confirmDelivery, type DeliveryRef } from './openlines.js';

const conversations = new KeyedMutex();

/** Operator reply in Contact Center -> WhatsApp. */
export async function processOutbound(job: Job<OutboundJob>): Promise<void> {
  await conversations.run(`${job.data.portalId}:${job.data.chatId}`, () => handle(job.data));
}

/** Our chat ids are deterministic, so the address can be derived even without a chat_map row. */
export function targetJid(chatId: string, lastJid?: string | null): string | null {
  if (isGroupJid(chatId) || isLidJid(chatId)) return chatId;
  const phone = phoneFromJid(chatId);
  if (phone) return `${phone}@s.whatsapp.net`;
  return lastJid ?? null;
}

async function handle(data: OutboundJob): Promise<void> {
  const portal = await getPortalById(data.portalId);
  if (!portal || portal.status !== 'active') return;
  const number = await getNumberByLine(portal.id, data.lineId);
  if (!number) {
    logger.warn({ lineId: data.lineId }, 'operator reply on a line with no WhatsApp number - dropped');
    return;
  }
  if (!licenseOf(portal).canSend) {
    await postNote(portal, data.bitrixChatId, `⚠️ Not delivered to WhatsApp. ${PAYMENT_REQUIRED_MESSAGE}`).catch(() => undefined);
    return;
  }
  const ref: DeliveryRef = {
    lineId: data.lineId,
    chatId: data.chatId,
    bitrixChatId: data.bitrixChatId,
    bitrixMessageId: data.bitrixMessageId,
  };

  const c = await claim(number.id, 'out', { extRef: String(data.bitrixMessageId) });
  if (!c.proceed) {
    // Already sent: a retry may only repeat the Bitrix confirmation, never the WhatsApp send.
    if (c.row.status === 'sent' && c.row.wa_message_id) await confirmDelivery(portal, ref, c.row.wa_message_id);
    return;
  }

  const chat = await findChatByChatId(number.id, data.chatId);
  const jid = targetJid(data.chatId, chat?.last_jid);
  if (!jid) {
    await markFailed(c.row.id, 'UNKNOWN_RECIPIENT');
    return;
  }

  const engine = getEngine();
  const text = bbcodeToWhatsApp(data.text);
  let firstId: string | null = null;
  let caption = text;

  for (const file of data.files) {
    const fetched = await fetchBitrixFile(portal, file.url);
    const kind = mediaKindFor(file.name, fetched.mime, file.type);
    // Voice notes carry no caption: send the text on its own first.
    if (kind === 'audio' && caption) {
      firstId ??= await engine.sendText(number.id, jid, caption);
      caption = '';
    }
    const id = await engine.sendMedia(number.id, jid, {
      kind,
      data: fetched.data,
      mime: fetched.mime,
      fileName: file.name || 'file',
      caption: kind === 'audio' ? undefined : caption || undefined,
    });
    if (kind !== 'audio') caption = '';
    firstId ??= id;
  }
  if (caption) {
    const id = await engine.sendText(number.id, jid, caption);
    firstId ??= id;
  }
  if (!firstId) {
    await markFailed(c.row.id, 'EMPTY_MESSAGE');
    return;
  }

  await markSent(c.row.id, firstId, { ...ref });
  await confirmWithRetry(portal, ref, firstId);
}

async function confirmWithRetry(portal: Parameters<typeof confirmDelivery>[0], ref: DeliveryRef, waId: string) {
  for (const delay of [0, 1000, 2000]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      await confirmDelivery(portal, ref, waId);
      return;
    } catch (err) {
      if (delay === 2000) throw err; // queue retry comes back through the 'sent' branch above
    }
  }
}
