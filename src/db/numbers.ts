import { randomUUID } from 'node:crypto';
import type { NumberStatus, WaNumber } from '../types.js';
import { audit } from './audit.js';
import { exec, many, nowSec, one } from './pool.js';

export async function createNumber(portalId: string, label: string, ownerUserId: number | null = null): Promise<WaNumber> {
  const ts = nowSec();
  const row = await one<WaNumber>(
    `INSERT INTO wa_numbers (id, portal_id, label, owner_user_id, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'new',$5,$5) RETURNING *`,
    [randomUUID(), portalId, label, ownerUserId, ts],
  );
  if (!row) throw new Error('number insert failed');
  return row;
}

export const getNumber = (id: string) => one<WaNumber>('SELECT * FROM wa_numbers WHERE id=$1', [id]);

/** Portal-scoped: one tenant can never address another tenant's number. */
export const getPortalNumber = (portalId: string, id: string) =>
  one<WaNumber>('SELECT * FROM wa_numbers WHERE id=$1 AND portal_id=$2', [id, portalId]);

export const listNumbers = (portalId: string) =>
  many<WaNumber>('SELECT * FROM wa_numbers WHERE portal_id=$1 ORDER BY created_at', [portalId]);

export const listAllNumbers = () => many<WaNumber>('SELECT * FROM wa_numbers ORDER BY created_at');

export const getNumberByLine = (portalId: string, lineId: number) =>
  one<WaNumber>('SELECT * FROM wa_numbers WHERE portal_id=$1 AND line_id=$2', [portalId, lineId]);

export async function setNumberStatus(id: string, status: NumberStatus, error: string | null = null): Promise<void> {
  const row = await one<{ portal_id: string; label: string; phone: string | null; old_status: string | null }>(
    `WITH old AS (SELECT status FROM wa_numbers WHERE id=$4)
     UPDATE wa_numbers SET status=$1::text, last_error=$2, updated_at=$3,
            status_changed_at = CASE WHEN status IS DISTINCT FROM $1::text OR status_changed_at IS NULL THEN $3 ELSE status_changed_at END
      WHERE id=$4
      RETURNING portal_id, label, phone, (SELECT status FROM old) AS old_status`,
    [status, error, nowSec(), id],
  );
  // Activity log: only what WhatsApp did. Admin actions (log out, pause) carry no error and are
  // logged by the API with who did them; routine reconnects are not worth a line.
  if (!row || row.old_status === status || !error) return;
  if (status === 'logged_out' || status === 'disconnected') {
    await audit({
      portalId: row.portal_id,
      actor: { type: 'system', name: 'WhatsApp' },
      action: status === 'logged_out' ? 'connection.logged_out' : 'connection.disconnected',
      target: { type: 'number', id, label: row.label },
      details: { error, phone: row.phone },
    });
  }
}

/** Which problem admins were last alerted about (null once it is resolved). */
export const setAlertedStatus = (id: string, status: string | null) =>
  exec('UPDATE wa_numbers SET alerted_status=$1 WHERE id=$2', [status, id]);

/** Every number of every active portal, for the alert watchdog. */
export const listActiveNumbers = () =>
  many<WaNumber>(`SELECT n.* FROM wa_numbers n JOIN portals p ON p.id = n.portal_id WHERE p.status = 'active' ORDER BY n.created_at`);

export async function setNumberPhone(id: string, phone: string): Promise<void> {
  const row = await one<{ portal_id: string; label: string; old_phone: string | null }>(
    `WITH old AS (SELECT phone FROM wa_numbers WHERE id=$3)
     UPDATE wa_numbers SET phone=$1, updated_at=$2 WHERE id=$3
     RETURNING portal_id, label, (SELECT phone FROM old) AS old_phone`,
    [phone, nowSec(), id],
  );
  // A (new) phone was linked by QR or pairing code - not a routine reconnect of the same phone.
  if (row && row.old_phone !== phone) {
    await audit({
      portalId: row.portal_id,
      actor: { type: 'system', name: 'WhatsApp' },
      action: 'connection.linked',
      target: { type: 'number', id, label: row.label },
      details: { phone, previousPhone: row.old_phone },
    });
  }
}

export const setGroupsEnabled = (id: string, enabled: boolean) =>
  exec('UPDATE wa_numbers SET groups_enabled=$1, updated_at=$2 WHERE id=$3', [enabled, nowSec(), id]);

/** A line feeds exactly one number: whoever held it before is unbound first. */
export async function bindLine(portalId: string, id: string, lineId: number | null): Promise<void> {
  if (lineId !== null) {
    await exec('UPDATE wa_numbers SET line_id=NULL, updated_at=$1 WHERE portal_id=$2 AND line_id=$3 AND id<>$4', [
      nowSec(),
      portalId,
      lineId,
      id,
    ]);
  }
  await exec('UPDATE wa_numbers SET line_id=$1, updated_at=$2 WHERE id=$3', [lineId, nowSec(), id]);
}

export const deleteNumber = (id: string) => exec('DELETE FROM wa_numbers WHERE id=$1', [id]);

export const getOwnedNumber = (portalId: string, userId: number) =>
  one<WaNumber>('SELECT * FROM wa_numbers WHERE portal_id=$1 AND owner_user_id=$2', [portalId, userId]);

export const setPersonalLine = (id: string, lineId: number) =>
  exec('UPDATE wa_numbers SET line_id=$1, personal_line=TRUE, updated_at=$2 WHERE id=$3', [lineId, nowSec(), id]);
