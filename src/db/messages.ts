import { randomUUID } from 'node:crypto';
import { exec, nowSec, one } from './pool.js';

export type Direction = 'in' | 'out' | 'phone_out' | 'crm_out' | 'event';

export interface MessageRow {
  id: string;
  number_id: string;
  direction: Direction;
  wa_message_id: string | null;
  ext_ref: string | null;
  status: string;
  error: string | null;
  meta: Record<string, unknown> | null;
  created_at: number;
}

export interface Claim {
  row: MessageRow;
  /** true = first time we see this message: do the work. false = an earlier delivery owns it. */
  proceed: boolean;
}

/**
 * Idempotency gate. Inserts a 'pending' row keyed by (number, direction, wa id | ext ref); a
 * redelivered webhook or a retried queue job finds the existing row instead.
 * A 'pending' row from a crashed earlier attempt is handed back with proceed=true so it can finish.
 */
export async function claim(
  numberId: string,
  direction: Direction,
  key: { waMessageId?: string; extRef?: string },
): Promise<Claim> {
  const column = key.waMessageId ? 'wa_message_id' : 'ext_ref';
  const value = key.waMessageId ?? key.extRef;
  if (!value) throw new Error('claim needs a key');
  const inserted = await one<MessageRow>(
    `INSERT INTO message_log (id, number_id, direction, ${column}, status, created_at)
     VALUES ($1,$2,$3,$4,'pending',$5)
     ON CONFLICT DO NOTHING RETURNING *`,
    [randomUUID(), numberId, direction, value, nowSec()],
  );
  if (inserted) return { row: inserted, proceed: true };
  const existing = await one<MessageRow>(
    `SELECT * FROM message_log WHERE number_id=$1 AND direction=$2 AND ${column}=$3`,
    [numberId, direction, value],
  );
  if (!existing) throw new Error('message_log claim lost its row');
  return { row: existing, proceed: existing.status === 'pending' };
}

export const markSent = (id: string, waMessageId: string | null, meta: Record<string, unknown> | null = null) =>
  exec(
    `UPDATE message_log SET status='sent', wa_message_id=COALESCE($2, wa_message_id), meta=COALESCE($3, meta), error=NULL WHERE id=$1`,
    [id, waMessageId, meta ? JSON.stringify(meta) : null],
  );

export const markFailed = (id: string, error: string) =>
  exec(`UPDATE message_log SET status='failed', error=$2 WHERE id=$1 AND status <> 'sent'`, [id, error.slice(0, 500)]);

export const markStatus = (id: string, status: 'delivered' | 'read') =>
  exec(`UPDATE message_log SET status=$2 WHERE id=$1`, [id, status]);

/** Outgoing message (operator reply or CRM send) by its WhatsApp id, for read receipts. */
export const findOutgoingByWaId = (numberId: string, waMessageId: string) =>
  one<MessageRow>(
    `SELECT * FROM message_log WHERE number_id=$1 AND wa_message_id=$2 AND direction IN ('out','crm_out') LIMIT 1`,
    [numberId, waMessageId],
  );
