import type { Job } from 'bullmq';
import { findChat } from '../db/chats.js';
import { claim, markFailed, markSent } from '../db/messages.js';
import { getNumber } from '../db/numbers.js';
import { getPortalById } from '../db/portals.js';
import { logger } from '../logger.js';
import { mediaUrl } from '../media/store.js';
import { inboundQueue } from '../queue/queues.js';
import { KeyedMutex } from '../util/keyedMutex.js';
import { whatsAppToBbcode } from '../util/format.js';
import { isGroupJid } from '../util/phone.js';
import { getEngine } from '../whatsapp/instance.js';
import type { InboundJob, InboundMessageJob, InboundNoteJob } from '../whatsapp/jobs.js';
import type { Portal, WaNumber } from '../types.js';
import { postNote, postToOpenLine } from './openlines.js';

const conversations = new KeyedMutex();

/** A number not bound to an Open Line yet: hold its messages for up to a day, re-checking every 5 min. */
const UNBOUND_RETRY_MS = 5 * 60_000;
const UNBOUND_MAX_AGE_MS = 24 * 3600_000;

export async function processInbound(job: Job<InboundJob>): Promise<void> {
  const data = job.data;
  await conversations.run(`${data.numberId}:${data.peer}`, () => handle(data));
}

async function handle(data: InboundJob): Promise<void> {
  const number = await getNumber(data.numberId);
  if (!number) return;
  const portal = await getPortalById(number.portal_id);
  if (!portal || portal.status !== 'active') return;
  if (isGroupJid(data.peer) && !number.groups_enabled) return;

  if (data.kind === 'note') return handleNote(portal, number, data);
  if (data.fromMe) return handlePhoneSent(portal, number, data);

  if (!number.line_id) {
    if (Date.now() - data.firstSeenAt > UNBOUND_MAX_AGE_MS) {
      logger.warn({ numberId: number.id }, 'inbound message dropped: number never bound to an Open Line');
      return;
    }
    await inboundQueue().add('message', data, { delay: UNBOUND_RETRY_MS });
    return;
  }

  const c = await claim(number.id, 'in', { waMessageId: data.waMessageId });
  if (!c.proceed) return;

  try {
    const engine = getEngine();
    const existing = await findChat(number.id, data.peer);
    const group = isGroupJid(data.peer);
    const name = group
      ? ((await engine.groupName(number.id, data.peer)) ?? existing?.name ?? 'WhatsApp group')
      : (data.pushName ?? existing?.name ?? `+${data.peer}`);
    const picture = existing ? null : await engine.profilePicture(number.id, data.jid);

    let text = whatsAppToBbcode(data.text);
    if (group && data.participant) text = `[b]${data.participant}:[/b] ${text}`;
    if (data.quoted) text = `[i]↪ ${data.quoted}[/i]\n${text}`;

    await postToOpenLine(portal, { ...number, line_id: number.line_id }, {
      peer: data.peer,
      jid: data.jid,
      messageId: data.waMessageId,
      date: data.timestamp,
      text: text.trim(),
      files: data.media ? [{ url: mediaUrl(data.media.key), name: data.media.name }] : [],
      name,
      picture,
      existing,
    });
    await markSent(c.row.id, null);
  } catch (err) {
    // Leave the row 'pending' so the queue retry can finish the job.
    throw err;
  }
}

/** Typed on the business phone (WhatsApp app): mirror into the chat so operators see the full thread. */
async function handlePhoneSent(portal: Portal, number: WaNumber, data: InboundMessageJob) {
  const chat = await findChat(number.id, data.peer);
  if (!chat?.bitrix_chat_id) return; // no Bitrix conversation yet - nothing to mirror into
  const c = await claim(number.id, 'phone_out', { waMessageId: data.waMessageId });
  if (!c.proceed) return;
  const file = data.media ? `\n[url=${mediaUrl(data.media.key)}]${data.media.name}[/url]` : '';
  await postNote(portal, chat.bitrix_chat_id, `📱 Sent from the phone:\n${whatsAppToBbcode(data.text)}${file}`.trim());
  await markSent(c.row.id, null);
}

async function handleNote(portal: Portal, number: WaNumber, data: InboundNoteJob) {
  const chat = await findChat(number.id, data.peer);
  if (!chat?.bitrix_chat_id) return;
  const c = await claim(number.id, 'event', { extRef: data.eventId });
  if (!c.proceed) return;
  try {
    await postNote(portal, chat.bitrix_chat_id, data.text.replace('{contact}', chat.name ?? `+${data.peer}`));
    await markSent(c.row.id, null);
  } catch (err) {
    await markFailed(c.row.id, (err as Error).message);
  }
}
