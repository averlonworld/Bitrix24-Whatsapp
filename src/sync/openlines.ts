import { call } from '../bitrix/client.js';
import { config } from '../config.js';
import { markChatNamed, upsertChat } from '../db/chats.js';
import { logger } from '../logger.js';
import type { ChatMapRow, Portal, WaNumber } from '../types.js';
import { NOTE_PREFIX } from '../util/format.js';
import { chatIdForPeer, isGroupJid, isLidJid } from '../util/phone.js';

/** Thin, typed wrappers over the imconnector / im methods that move messages in and out of Bitrix. */

interface SendMessagesResult {
  SUCCESS?: boolean;
  DATA?: { RESULT?: Array<{ SUCCESS?: boolean; session?: { ID?: string; CHAT_ID?: string }; error?: string }> };
}

export interface ToOpenLine {
  peer: string;
  jid: string;
  messageId: string;
  date: number;
  text: string;
  files?: Array<{ url: string; name: string }>;
  name: string;
  picture?: string | null;
  existing: ChatMapRow | null;
}

/**
 * Post one customer-side message into the number's Open Line. There is no separate "create chat"
 * call: the first message for an unseen chat.id opens the chat, and Bitrix's CRM tracker then
 * links or creates the contact / lead / deal according to the Open Line's CRM settings.
 */
export async function postToOpenLine(portal: Portal, number: WaNumber & { line_id: number }, msg: ToOpenLine): Promise<ChatMapRow> {
  const chatId = msg.existing?.chat_id ?? chatIdForPeer(msg.peer);
  const isPhone = !isGroupJid(msg.peer) && !isLidJid(msg.peer);
  const result = await call<SendMessagesResult>(portal, 'imconnector.send.messages', {
    CONNECTOR: config().connectorId,
    LINE: number.line_id,
    MESSAGES: [
      {
        user: {
          id: msg.peer,
          name: msg.name,
          ...(isPhone ? { phone: `+${msg.peer}` } : { skip_phone_validate: 'Y' }),
          ...(msg.picture ? { picture: { url: msg.picture } } : {}),
        },
        message: {
          id: msg.messageId,
          date: msg.date,
          text: msg.text || (msg.files?.length ? '' : '…'),
          ...(msg.files?.length ? { files: msg.files } : {}),
        },
        chat: { id: chatId, name: msg.name },
      },
    ],
  });
  const entry = result?.DATA?.RESULT?.[0];
  if (!result?.SUCCESS || !entry?.SUCCESS) {
    throw new Error(`imconnector.send.messages failed: ${JSON.stringify(entry ?? result).slice(0, 300)}`);
  }
  const bitrixChatId = entry.session?.CHAT_ID ? Number(entry.session.CHAT_ID) : null;
  const row = await upsertChat({
    numberId: number.id,
    peer: msg.peer,
    chatId,
    jid: msg.jid,
    name: msg.name,
    lineId: number.line_id,
    bitrixChatId,
  });

  // user.name names the Bitrix user, not the chat: title the chat once, after the customer.
  if (!row.named && bitrixChatId && msg.name && !/^\+?\d+$/.test(msg.name)) {
    try {
      await call(portal, 'imconnector.chat.name.set', {
        CONNECTOR: config().connectorId,
        LINE: number.line_id,
        CHAT_ID: chatId,
        NAME: msg.name,
        USER_ID: msg.peer,
      });
      await markChatNamed(row.id);
    } catch (err) {
      logger.debug({ err: (err as Error).message }, 'chat rename skipped');
    }
  }
  return row;
}

/** A note only operators see (never forwarded to WhatsApp - see routes/events.ts). */
export async function postNote(portal: Portal, bitrixChatId: number, text: string): Promise<void> {
  await call(portal, 'im.message.add', {
    DIALOG_ID: `chat${bitrixChatId}`,
    MESSAGE: `${NOTE_PREFIX}${text}`,
    SYSTEM: 'Y',
  });
}

export interface DeliveryRef {
  lineId: number;
  chatId: string;
  bitrixChatId: number;
  bitrixMessageId: number;
}

/** Turns the operator's message from "sending" to delivered in Contact Center. */
export async function confirmDelivery(portal: Portal, ref: DeliveryRef, waMessageId: string): Promise<void> {
  await call(portal, 'imconnector.send.status.delivery', {
    CONNECTOR: config().connectorId,
    LINE: ref.lineId,
    MESSAGES: [
      {
        im: { chat_id: ref.bitrixChatId, message_id: ref.bitrixMessageId },
        message: { id: [waMessageId], date: Math.floor(Date.now() / 1000) },
        chat: { id: ref.chatId },
      },
    ],
  });
}

/** WhatsApp blue ticks -> "read" in Contact Center. */
export async function confirmRead(portal: Portal, ref: DeliveryRef, waMessageId: string): Promise<void> {
  await call(portal, 'imconnector.send.status.reading', {
    CONNECTOR: config().connectorId,
    LINE: ref.lineId,
    MESSAGES: [
      {
        im: { chat_id: ref.bitrixChatId, message_id: ref.bitrixMessageId },
        message: { id: [waMessageId], date: Math.floor(Date.now() / 1000) },
        chat: { id: ref.chatId },
      },
    ],
  });
}

/**
 * Make sure an Open Line chat exists for a peer the business is contacting first (click-to-chat,
 * robot, SMS provider). Bitrix can only open a chat with a customer-side message, so a short
 * system line is posted as that first message.
 */
export async function ensureChat(
  portal: Portal,
  number: WaNumber & { line_id: number },
  peer: string,
  name: string | null,
  existing: ChatMapRow | null,
): Promise<ChatMapRow> {
  if (existing?.bitrix_chat_id && existing.line_id === number.line_id) return existing;
  return postToOpenLine(portal, number, {
    peer,
    jid: chatIdForPeer(peer),
    messageId: `open-${peer}-${Date.now()}`,
    date: Math.floor(Date.now() / 1000),
    text: `${NOTE_PREFIX}Conversation started from CRM`,
    name: name || `+${peer}`,
    existing: existing?.line_id === number.line_id ? existing : null,
  });
}
