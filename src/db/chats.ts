import { randomUUID } from 'node:crypto';
import type { ChatMapRow } from '../types.js';
import { exec, nowSec, one } from './pool.js';

export const findChat = (numberId: string, peer: string) =>
  one<ChatMapRow>('SELECT * FROM chat_map WHERE number_id=$1 AND peer=$2', [numberId, peer]);

export const findChatByChatId = (numberId: string, chatId: string) =>
  one<ChatMapRow>('SELECT * FROM chat_map WHERE number_id=$1 AND chat_id=$2', [numberId, chatId]);

/** Portal-scoped: Bitrix chat ids are only unique within one portal. */
export const findChatByBitrixChatId = (portalId: string, bitrixChatId: number) =>
  one<ChatMapRow>(
    `SELECT c.* FROM chat_map c JOIN wa_numbers n ON n.id = c.number_id
     WHERE n.portal_id=$1 AND c.bitrix_chat_id=$2 ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1`,
    [portalId, bitrixChatId],
  );

export async function upsertChat(input: {
  numberId: string;
  peer: string;
  chatId: string;
  jid: string;
  name?: string | null;
  lineId: number | null;
  bitrixChatId?: number | null;
}): Promise<ChatMapRow> {
  const row = await one<ChatMapRow>(
    `INSERT INTO chat_map (id, number_id, peer, chat_id, last_jid, name, line_id, bitrix_chat_id, last_message_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (number_id, peer) DO UPDATE SET
       last_jid        = EXCLUDED.last_jid,
       name            = COALESCE(EXCLUDED.name, chat_map.name),
       line_id         = COALESCE(EXCLUDED.line_id, chat_map.line_id),
       bitrix_chat_id  = COALESCE(EXCLUDED.bitrix_chat_id, chat_map.bitrix_chat_id),
       last_message_at = EXCLUDED.last_message_at
     RETURNING *`,
    [
      randomUUID(),
      input.numberId,
      input.peer,
      input.chatId,
      input.jid,
      input.name ?? null,
      input.lineId,
      input.bitrixChatId ?? null,
      nowSec(),
    ],
  );
  if (!row) throw new Error('chat upsert failed');
  return row;
}

export const markChatNamed = (id: string) => exec('UPDATE chat_map SET named=TRUE WHERE id=$1', [id]);
